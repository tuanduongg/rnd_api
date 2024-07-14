import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Concept } from 'src/database/entity/concept.entity';
import { Between, In, Like, Repository } from 'typeorm';
import * as zlib from 'zlib';
import * as fs from 'fs';
import * as stream from 'stream';
import * as path from 'path';
import * as archiver from 'archiver';
import {
  convertToDigits,
  getFileNameWithoutExtension,
} from 'src/core/utils/helper';
import { FileConceptService } from '../file_concept/file_concept.service';
import { CategoryConcept } from 'src/database/entity/category_concept.entity';
import { User } from 'src/database/entity/user.entity';
import { HistoryConceptService } from '../history_concept/history_concept.service';

@Injectable()
export class ConceptService {
  constructor(
    @InjectRepository(Concept)
    private repository: Repository<Concept>,
    private readonly fileConceptService: FileConceptService,
    private readonly historyConceptService: HistoryConceptService,
  ) { }

  async all(res, request, body) {
    const {
      personName,
      categoryFilter,
      startDate,
      endDate,
      codeFilter,
      plNameFilter,
      modelFilter,
      productNameFilter,
      page,
      rowsPerPage
    } = body;
    const take = +rowsPerPage || 10;
    const newPage = +page || 0;
    const skip = newPage * take;

    const whereOBJ = {
      regisDate: Between(startDate, endDate),
      code: Like(`%${codeFilter}%`),
      plName: Like(`%${plNameFilter}%`),
      modelName: Like(`%${modelFilter}%`),
      productName: Like(`%${productNameFilter}%`),
      category: { categoryId: In(categoryFilter) },
      user: { userId: In(personName) },
    };

    if (personName?.length > 0) {
      whereOBJ.user = { userId: In(personName) };
    } else {
      delete whereOBJ.user;
    }
    if (categoryFilter?.length > 0) {
      whereOBJ.category = { categoryId: In(categoryFilter) };
    } else {
      delete whereOBJ.category;
    }

    const [data, total] = await this.repository.findAndCount({
      where: whereOBJ,
      select: {
        conceptId: true,
        modelName: true,
        plName: true,
        code: true,
        productName: true,
        regisDate: true,
        approval: true,
        category: {
          categoryName: true,
        },
        user: {
          fullName: true,
          userName: true,
        },
      },
      relations: ['category', 'user'],
      skip: skip,
      take: take,
    });
    const newData = data.map((item) => ({
      ...item,
      isMe: item?.user?.userName === request?.user?.userName,
    }));
    return res.status(HttpStatus.OK).send({ data: newData, total });
  }
  async accept(res, request, body) {
    const conceptId = body?.conceptId;
    if (!conceptId) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send({ message: 'Cannot found ID!' });
    }
    const data = await this.repository.findOne({
      where: { conceptId: conceptId },
    });
    if (data && !data?.approval) {
      data.approval = request?.user?.userName;
      try {
        await this.repository.save(data);
        await this.historyConceptService.add(
          data,
          {
            type: 'UPDATE',
            historyRemark: `Accepted by ${request?.user?.fullName}`,
          },
          request,
        );
        return res.status(HttpStatus.OK).send(data);
      } catch (error) {
        return res.status(HttpStatus.OK).send({ message: 'Update fail!' });
      }
    }
    return res
      .status(HttpStatus.BAD_REQUEST)
      .send({ message: 'An error occurred while updating!' });
  }
  async detail(res, request, body) {
    const conceptId = body?.conceptId;
    if (!conceptId) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send({ message: 'Cannot found ID!' });
    }
    const data = await this.repository.findOne({
      where: { conceptId: conceptId },
      relations: ['category', 'files'],
    });
    return res.status(HttpStatus.OK).send(data);
  }

  async history(res, request, body) {
    const conceptId = body?.conceptId;
    if (!conceptId) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send({ message: 'Cannot found ID!' });
    }
    const data = await this.historyConceptService.findByConcept(+conceptId);
    return res.status(HttpStatus.OK).send(data);
  }
  async add(res, request, body, files) {
    files?.map(async (file) => {
      file.originalname = Buffer.from(file.originalname, 'latin1').toString(
        'utf8',
      );
      await this.uploadAndCompressFileZip(file);
    });
    return res.status(HttpStatus.OK).send({ message: 'oke' });

    const data = body?.data;
    const dataObj = JSON.parse(data);
    const concept = new Concept();
    if (dataObj?.category) {
      concept.category = new CategoryConcept().categoryId = dataObj.category;
    }
    concept.code = dataObj?.code;
    concept.modelName = dataObj?.modelName;
    concept.productName = dataObj?.productName;
    concept.regisDate = dataObj?.regisDate;
    concept.plName = dataObj?.plName;

    const user = new User();
    user.userId = request?.user?.userId;
    concept.user = user;
    try {
      await this.repository.save(concept);
      await this.historyConceptService.add(
        concept,
        {
          type: 'ADD',
          historyRemark: 'Create new',
        },
        request,
      );
      files?.map(async (file) => {
        file.originalname = Buffer.from(file.originalname, 'latin1').toString(
          'utf8',
        );

        // await this.uploadAndCompressFile(file, concept);
      });
      return res.status(HttpStatus.OK).send(concept);
    } catch (error) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send({ message: 'Save change fail!' });
    }
  }

  async update(res, request, body, files) {

    const data = body?.data;
    const dataObj = JSON.parse(data);
    if (!dataObj?.conceptId) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send({ message: 'Cannot found ID!' });
    }
    const concept = await this.repository.findOne({
      where: { conceptId: dataObj?.conceptId },
      relations: ['category']
    });
    if (!concept) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send({ message: 'Cannot found Record!' });
    }
    let checkChangeInfor = false;
    if (dataObj?.category !== concept?.category?.categoryId) {
      concept.category = new CategoryConcept().categoryId = dataObj.category;
      checkChangeInfor = true;
    }
    if (concept?.code !== dataObj?.code) {
      checkChangeInfor = true;
      concept.code = dataObj?.code;
    }
    if (concept?.modelName !== dataObj?.modelName) {
      checkChangeInfor = true;
    }
    if (concept.modelName !== dataObj?.modelName) {
      checkChangeInfor = true;
      concept.modelName = dataObj?.modelName;
    }
    if (concept.productName !== dataObj?.productName) {
      checkChangeInfor = true;
      concept.productName = dataObj?.productName;
    }
    if (concept.regisDate !== dataObj?.regisDate) {
      checkChangeInfor = true;
      concept.regisDate = dataObj?.regisDate;

    }
    if (concept.plName !== dataObj?.plName) {
      checkChangeInfor = true;
      concept.plName = dataObj?.plName;
    }
    try {
      await this.repository.save(concept);
      const textFile = [];
      const textFileAdd = [];
      if (dataObj?.fileList && dataObj?.fileList?.length > 0) {
        const fileIdDelete = [];
        dataObj?.fileList.map((item) => {
          if (!item?.isShow) {
            fileIdDelete.push(item?.fileId);
            textFile.push(`${item?.fileName}${item?.fileExtenstion ? `.${item.fileExtenstion}` : ''}`);
          }
        });
        await this.fileConceptService.delete(fileIdDelete);
      }

      if (files?.length > 0) {
        files?.map(async (file) => {
          const buffFileName = Buffer.from(file.originalname, 'latin1').toString(
            'utf8',
          );

          file.originalname = buffFileName//set name file utf-8
          textFileAdd.push(buffFileName)
          await this.uploadAndCompressFile(file, concept);

        });
      }
      await this.historyConceptService.add(
        concept,
        {
          type: 'UPDATE',
          historyRemark: `${checkChangeInfor ? ` - Update infomation` : ''}${textFile?.length > 0 ? ` - Delete File: ${textFile.join(' ,')}` : ''} ${textFileAdd?.length > 0 ? ` - Add File:${textFileAdd.join(' ,')}` : ''}`,
        },
        request,
      );
      return res.status(HttpStatus.OK).send(concept);
    } catch (error) {
      console.log('error', error);
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send({ message: 'Save change fail!' });
    }
  }

  async uploadAndCompressFile(file: any, concept: Concept) {
    try {
      const randomFileName = Array(32)
        .fill(null)
        .map(() => Math.round(Math.random() * 16).toString(16))
        .join('');
      const buffer = file.buffer; // Lấy buffer từ tệp tải lên
      const currentDate = new Date();
      const folderName = `${convertToDigits(currentDate.getDate())}${convertToDigits(currentDate.getMonth() + 1)}${currentDate.getFullYear()}`;
      const folder = 'uploads' + `/${folderName}`;
      const uploadDir = path.join('./public', folder);
      const fileName = `${randomFileName}.gz`;
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true }); // Tạo thư mục nếu chưa tồn tại
      }
      const compressedFilePath = path.join(uploadDir, fileName); // Đường dẫn để lưu tệp nén
      const pathToFile = folder + '/' + fileName;

      const gzip = zlib.createGzip(); // Tạo đối tượng gzip để nén
      const output = fs.createWriteStream(compressedFilePath); // Tạo luồng ghi cho tệp nén

      // Chuyển đổi buffer thành luồng đọc
      const bufferStream = new stream.PassThrough();
      bufferStream.end(buffer);

      // Xử lý khi hoàn thành quá trình nén
      output.on('close', async () => {
        // const stats = fs.statSync(compressedFilePath); // Lấy thông tin tệp của tệp nén
        // // const compressedSize = stats.size; // Lấy kích thước của tệp nén
        // console.log('file save', {
        //   filePath: pathToFile, // Đường dẫn tới tệp nén
        //   originalName: Buffer.from(file.originalname, 'latin1').toString(
        //     'utf8',
        //   ), // Tên gốc của tệp
        //   mimeType: file.mimetype, // Loại MIME của tệp gốc
        //   size: file.size, // Kích thước của tệp gốc
        //   fileExtenstion: file?.originalname.split('.').pop(), // Kích thước của tệp nén
        // });
        await this.fileConceptService.add(
          [
            {
              filePath: pathToFile, // Đường dẫn tới tệp nén
              originalName: getFileNameWithoutExtension(file?.originalname), // Tên gốc của tệp
              mimeType: file.mimetype, // Loại MIME của tệp gốc
              size: file.size, // Kích thước của tệp gốc
              fileExtenstion: file?.originalname?.includes('.') ? file?.originalname.split('.').pop() : '', // Kích thước của tệp nén
            },
          ],
          concept,
        ); // Lưu thông tin tệp mới vào cơ sở dữ liệu
      });


      bufferStream.pipe(gzip).pipe(output); // Truyền buffer qua gzip tới luồng ghi

      return true;
    } catch (error) {
      console.error('Error during file upload and compression:', error); // Ghi bất kỳ lỗi nào xảy ra
      throw new HttpException(
        'Failed to upload and compress file. Please try again later',
        HttpStatus.INTERNAL_SERVER_ERROR,
      ); // Ném ra một ngoại lệ HTTP nếu có lỗi xảy ra
    }
  }
  async uploadAndCompressFileZip(file): Promise<string> {
    try {
      const buffer = file.buffer;  // Lấy buffer từ tệp tải lên
      const rootDir = process.cwd();  // Lấy đường dẫn thư mục gốc của dự án
      const uploadDir = path.join(rootDir, 'src', 'upload');  // Thư mục upload là thư mục con của src
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });  // Tạo thư mục nếu chưa tồn tại
      }
      const zipFilePath = path.join(uploadDir, `${file.originalname}.zip`);  // Đường dẫn để lưu tệp ZIP
      const output = fs.createWriteStream(zipFilePath);  // Tạo luồng ghi cho tệp ZIP
      const archive = archiver('zip', { zlib: { level: 9 } });  // Tạo đối tượng archiver để nén với định dạng ZIP và mức nén tối đa

      // Xử lý khi hoàn thành quá trình nén
      output.on('close', async () => {
        const stats = fs.statSync(zipFilePath);  // Lấy thông tin tệp của tệp ZIP
        const compressedSize = stats.size;  // Lấy kích thước của tệp ZIP
        console.log({
          filePath: zipFilePath,  // Đường dẫn tới tệp ZIP
          originalName: file.originalname,  // Tên gốc của tệp
          mimeType: file.mimetype,  // Loại MIME của tệp gốc
          size: file.size,  // Kích thước của tệp gốc
          compressedSize: compressedSize,  // Kích thước của tệp ZIP
        });
      });

      archive.on('error', (err) => {
        throw err;
      });

      // Truyền dữ liệu nén từ archiver tới luồng ghi
      archive.pipe(output);

      // Thêm buffer vào lưu trữ
      archive.append(buffer, { name: file.originalname });

      // Hoàn thành việc tạo tệp ZIP
      await archive.finalize();

      return zipFilePath;  // Trả về đường dẫn tới tệp ZIP
    } catch (error) {
      console.error('Error during file upload and compression:', error);  // Ghi bất kỳ lỗi nào xảy ra
      throw new HttpException(
        'Failed to upload and compress file. Please try again later',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );  // Ném ra một ngoại lệ HTTP nếu có lỗi xảy ra
    }
  }
}
