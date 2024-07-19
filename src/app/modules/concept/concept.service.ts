import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Concept } from 'src/database/entity/concept.entity';
import { Between, In, Like, Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as archiver from 'archiver';
import { Stream } from 'stream';
import {
  convertToDigits,
  getExtenstionFromOriginalName,
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
  ) {}

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
      rowsPerPage,
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
      order: { regisDate: 'ASC' },
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
    if (data?.approval) {
      return res.status(HttpStatus.BAD_REQUEST).send({
        message: 'Accepted by ' + data?.approval + '.Please refresh this page!',
      });
    }
    if (data && !data?.approval) {
      data.approval = request?.user?.userName;
      try {
        await this.repository.save(data);
        await this.historyConceptService.add(
          data,
          {
            type: 'UPDATE',
            historyRemark: `Accepted by ${request?.user?.userName}`,
          },
          request,
        );
        return res.status(HttpStatus.OK).send(data);
      } catch (error) {
        return res
          .status(HttpStatus.BAD_REQUEST)
          .send({ message: 'Update fail!' });
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

  async downloadMultiple(res, request, body) {
    const fileIds = body?.fileIds;
    if (fileIds && fileIds?.length > 0) {
      const files = await this.fileConceptService.findByArrayId(fileIds);
      if (files?.length > 0) {
        const archiveStream = await this.zipFiles(files);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename=files.zip');
        res.status(HttpStatus.OK);
        archiveStream.pipe(res);
        return res;
      }
    }
    return res.status(404).send('File not found');
  }
  async download(res, request, body) {
    const fileID = body?.fileId;
    if (fileID) {
      const file = await this.fileConceptService.findById(fileID);
      if (file) {
        const url = file?.fileUrl;
        const filePath = path
          .join(__dirname, '..', 'public', `${url}`)
          .replace('dist\\app\\modules\\', '');
        if (fs.existsSync(filePath)) {
          return res
            .status(HttpStatus.OK)
            .download(filePath, file?.fileName, (err) => {
              if (err) {
                console.error(err);
                return res.status(500).send('Error downloading file');
              }
            });
        }
      }
      return res.status(404).send('File not found');
    }
    return res
      .status(HttpStatus.BAD_REQUEST)
      .send({ message: 'Cannot found record!' });
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
      if (files && files?.length > 0) {
        const newFiles = files.map((item: any) => ({
          filePath: `${item?.path}`.replace('public\\', ''), // Đường dẫn tới tệp nén
          originalName: getFileNameWithoutExtension(
            Buffer.from(item?.originalname, 'latin1').toString('utf8'),
          ), // Tên gốc của tệp
          mimeType: item.mimetype, // Loại MIME của tệp gốc
          size: item.size, // Kích thước của tệp gốc
          fileExtenstion: getExtenstionFromOriginalName(item?.filename), // Kích thước của tệp nén
        }));
        await this.fileConceptService.add(newFiles, concept); // Lưu thông tin tệp mới vào cơ sở dữ liệu
      }
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
      relations: ['category'],
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
            const buffFileName = Buffer.from(item?.fileName, 'latin1').toString(
              'utf8',
            );
            const fileName = getFileNameWithoutExtension(buffFileName);
            textFile.push(
              `${fileName}${item?.fileExtenstion ? `.${item.fileExtenstion}` : ''}`,
            );
          }
        });
        await this.fileConceptService.delete(fileIdDelete);
      }
      const newFiles = files.map((item: any) => {
        const buffFileName = Buffer.from(item?.originalname, 'latin1').toString(
          'utf8',
        );
        const fileName = getFileNameWithoutExtension(buffFileName);
        const extenstionFile = getExtenstionFromOriginalName(item?.filename);
        textFileAdd.push(
          `${fileName}${extenstionFile ? '.' + extenstionFile : extenstionFile}`,
        );
        return {
          filePath: `${item?.path}`.replace('public\\', ''), // Đường dẫn tới tệp nén
          originalName: fileName, // Tên gốc của tệp
          mimeType: item.mimetype, // Loại MIME của tệp gốc
          size: item.size, // Kích thước của tệp gốc
          fileExtenstion: extenstionFile, // Kích thước của tệp nén
        };
      });
      await this.fileConceptService.add(newFiles, concept); // Lưu thông tin tệp mới vào cơ sở dữ liệu
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

  async uploadAndCompressFileZip(file: any, concept: Concept) {
    try {
      const buffer = file.buffer; // Lấy buffer từ tệp tải lên
      const randomFileName = Array(32)
        .fill(null)
        .map(() => Math.round(Math.random() * 16).toString(16))
        .join('');
      const currentDate = new Date();
      const folderName = `${convertToDigits(currentDate.getDate())}${convertToDigits(currentDate.getMonth() + 1)}${currentDate.getFullYear()}`;
      const folder = 'uploads' + `/${folderName}`;
      const uploadDir = path.join('./public', folder);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true }); // Tạo thư mục nếu chưa tồn tại
      }
      const zipFileName = `${randomFileName}.zip`; // Đường dẫn để lưu tệp ZIP
      const compressedFilePath = path.join(uploadDir, zipFileName); // Đường dẫn để lưu tệp nén

      const output = fs.createWriteStream(compressedFilePath); // Tạo luồng ghi cho tệp ZIP
      const archive = archiver('zip', { zlib: { level: 9 } }); // Tạo đối tượng archiver để nén với định dạng ZIP và mức nén tối đa
      const pathToFile = folder + '/' + zipFileName;

      // Xử lý khi hoàn thành quá trình nén
      output.on('close', async () => {
        await this.fileConceptService.add(
          [
            {
              filePath: pathToFile, // Đường dẫn tới tệp nén
              originalName: getFileNameWithoutExtension(file?.originalname), // Tên gốc của tệp
              mimeType: file.mimetype, // Loại MIME của tệp gốc
              size: file.size, // Kích thước của tệp gốc
              fileExtenstion: file?.originalname?.includes('.')
                ? file?.originalname.split('.').pop()
                : '', // Kích thước của tệp nén
            },
          ],
          concept,
        ); // Lưu thông tin tệp mới vào cơ sở dữ liệu
      });

      archive.on('error', (err) => {
        throw err;
      });

      // Truyền dữ liệu nén từ archiver tới luồng ghi
      archive.pipe(output);

      // Thêm buffer vào lưu trữ
      archive.append(buffer, { name: file?.originalname });

      // Hoàn thành việc tạo tệp ZIP
      await archive.finalize();

      return true; // Trả về đường dẫn tới tệp ZIP
    } catch (error) {
      console.error('Error during file upload and compression:', error); // Ghi bất kỳ lỗi nào xảy ra
      throw new HttpException(
        'Failed to upload and compress file. Please try again later',
        HttpStatus.INTERNAL_SERVER_ERROR,
      ); // Ném ra một ngoại lệ HTTP nếu có lỗi xảy ra
    }
  }

  async zipFiles(files: any[]): Promise<Stream> {
    const archive = archiver('zip', {
      zlib: { level: 9 },
    });
    files.forEach((file) => {
      const url = file?.fileUrl;
      const filePath = path
        .join(__dirname, '..', 'public', `${url}`)
        .replace('dist\\app\\modules\\', '');
      archive.file(filePath, {
        name: `${file?.fileName + '.' + file?.fileExtenstion}`,
      });
    });
    archive.finalize();
    return archive;
  }
}