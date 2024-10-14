import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Company } from 'src/database/entity/company.entity';
import { ModelMold } from 'src/database/entity/model_mold.entity';
import { OutputJig } from 'src/database/entity/output_jig.entity';
import { FindManyOptions, In, Like, Repository } from 'typeorm';
import { CompanyService } from '../company/company.service';
import {
  checkStatusOnChange,
  formatDateFromDB,
  getDepartmentEditMold,
  getStatusMoldName,
  isDateDifferent,
  LIST_COL_MOLD_REPORT,
  LIST_COL_MOLD_REPORT_ID,
} from 'src/core/utils/helper';
import { HistoryOutJigService } from '../history_out_jig/history_concept.service';
import { HistoryTryNoService } from '../history_tryno/history_tryno.service';
import { HistoryTryNo } from 'src/database/entity/history_tryno.entity';
const ExcelJS = require('exceljs');

@Injectable()
export class OutputJigService {
  private ARR_PROP_OBJECT_COMPANY = [];
  constructor(
    @InjectRepository(OutputJig)
    private repository: Repository<OutputJig>,
    private readonly companyService: CompanyService,
    private readonly historyService: HistoryOutJigService,
    private readonly historyTrynoService: HistoryTryNoService,
  ) {
    this.ARR_PROP_OBJECT_COMPANY = [
      'manufacturer',
      'shipArea',
      'massCompany',
      'modificationCompany',
    ];
  }

  async all(body, request, res) {
    const result = await this.getAll2(body, true);
    return res.status(HttpStatus.OK).send(result);
  }

  async add(body, request, res) {
    const arrCodeFind = [];
    const objPropCodeFind = {};
    const flagCheckCode = [];
    this.ARR_PROP_OBJECT_COMPANY.map((prop) => {
      // nếu chỉ có code -> tìm id
      const companyCode = body[prop]?.companyCode?.trim();
      if (companyCode && !body[prop]?.companyID) {
        arrCodeFind.push(companyCode);
        objPropCodeFind[prop] = body[prop];
      }
    });
    const arrComFinded = await this.companyService.findByCode(arrCodeFind);
    Object.keys(objPropCodeFind)?.map((field) => {
      const codeItem = objPropCodeFind[field]?.companyCode?.trim();
      const find = arrComFinded.find(
        (company) => company.companyCode === codeItem,
      );
      if (find) {
        objPropCodeFind[field]['companyID'] = find?.companyID;
        objPropCodeFind[field]['companyName'] = find?.companyName;
      } else {
        if (!flagCheckCode.includes(codeItem)) {
          flagCheckCode.push(codeItem);
        }
      }
    });
    if (flagCheckCode?.length > 0) {
      return res.status(HttpStatus.BAD_REQUEST).send({
        message:
          `"${flagCheckCode.join(', ').replace(/, ([^,]*)$/, ' and $1')}"` +
          ' not existing!',
      });
    }

    const newBody = { ...body, ...objPropCodeFind };

    const newModel = new OutputJig();
    newModel.model = { modelID: newBody?.modelID } as ModelMold;
    newModel.moldNo = newBody?.moldNo;
    newModel.productionStatus = newBody?.productionStatus || 'DEV';
    if (newBody?.manufacturer?.companyID) {
      newModel.manufacturer = newBody?.manufacturer as Company;
    }
    if (newBody?.shipArea?.companyID) {
      newModel.shipArea = newBody?.shipArea as Company;
    }

    if (newBody?.massCompany?.companyID) {
      newModel.massCompany = newBody?.massCompany as Company;
    }

    // if (newBody?.modificationCompany?.companyID) {
    //   newModel.modificationCompany = newBody?.modificationCompany as Company;
    // }
    // newModel.wearingPlan = newBody?.wearingPlan;

    newModel.shipDate = newBody?.shipDate;
    newModel.shipMassCompany = newBody?.shipMassCompany;
    // newModel.outputEdit = newBody?.outputEdit;
    // newModel.receivingCompleted = newBody?.receivingCompleted;

    newModel.createAt = new Date();
    newModel.createBy = request?.user?.userName;
    try {
      await this.repository.save(newModel);

      ///history tryno
      if (
        newBody?.modificationCompany?.companyID ||
        newBody?.outputEdit ||
        newBody?.receivingCompleted ||
        newBody?.wearingPlan ||
        newBody?.tryNo ||
        newBody?.historyEdit?.trim() !== ''
      ) {
        await this.historyTrynoService.add(
          newModel,
          {
            wearingPlan: newBody?.wearingPlan,
            outputEdit: newBody?.outputEdit,
            receivingCompleted: newBody?.receivingCompleted,
            modificationCompany: newBody?.modificationCompany?.companyID
              ? (newBody?.modificationCompany as Company)
              : null,
            remark: newBody?.historyEdit?.trim() || '',
            tryNum: newBody?.tryNo ? parseInt(`${newBody?.tryNo}`) : null,
            currentTry: true,
          },
          request,
        );
      }

      //history
      await this.historyService.add(
        newModel,
        {
          historyType: 'ADD',
          historyRemark: 'Create new',
        },
        request,
      );
      return res.status(HttpStatus.OK).send(newModel);
    } catch (error) {
      console.log('error', error);

      return res.status(HttpStatus.BAD_REQUEST).send({
        message: `Create fail!`,
      });
    }
  }

  async findOneToUpdate(body) {
    const { outputJigID } = body;
    const data = await this.repository
      .createQueryBuilder('outputJig')
      .leftJoinAndSelect('outputJig.model', 'model')
      .leftJoinAndSelect('outputJig.manufacturer', 'manufacturer')
      .leftJoinAndSelect('outputJig.shipArea', 'shipArea')
      .leftJoinAndSelect('outputJig.massCompany', 'massCompany')
      .leftJoinAndSelect('model.category', 'category')
      .leftJoinAndSelect('outputJig.historyTryNo', 'historyTryNo')
      .leftJoinAndSelect(
        'historyTryNo.modificationCompany',
        'modificationCompany',
      )
      .select([
        'outputJig.outputJigID',
        'outputJig.moldNo',
        'outputJig.shipMassCompany',
        'outputJig.shipDate',
        'outputJig.productionStatus',
        'model.modelID',
        'category.categoryId',
        'category.categoryName',
        'manufacturer.companyID',
        'manufacturer.companyCode',
        'shipArea.companyID',
        'shipArea.companyCode',
        'modificationCompany.companyID',
        'modificationCompany.companyCode',
        'massCompany.companyID',
        'massCompany.companyCode',
        'historyTryNo.historyTryNoId',
        'historyTryNo.tryNum',
        'historyTryNo.currentTry',
        'historyTryNo.remark',
        'historyTryNo.wearingPlan',
        'historyTryNo.outputEdit',
        'historyTryNo.receivingCompleted',
      ])
      .where('outputJig.outputJigID = :outputJigID', {
        outputJigID: outputJigID,
      })
      .getOne();
    return data;
  }

  async update(body, request, res) {
    const findModel = await this.findOneToUpdate(body);

    if (findModel) {
      const arrCodeFind = [];
      const objPropCodeFind = {};
      const flagCheckCode = [];
      this.ARR_PROP_OBJECT_COMPANY.map((prop) => {
        // nếu chỉ có code -> tìm id
        const companyCode = body[prop]?.companyCode?.trim();
        if (companyCode && !body[prop]?.companyID) {
          arrCodeFind.push(companyCode);
          objPropCodeFind[prop] = body[prop];
        }
      });

      const arrComFinded = await this.companyService.findByCode(arrCodeFind);
      Object.keys(objPropCodeFind)?.map((field) => {
        const codeItem = objPropCodeFind[field]?.companyCode?.trim();
        const find = arrComFinded.find(
          (company) => company?.companyCode === codeItem,
        );
        if (find) {
          objPropCodeFind[field]['companyID'] = find?.companyID;
          objPropCodeFind[field]['companyName'] = find?.companyName;
        } else {
          if (!flagCheckCode.includes(codeItem)) {
            flagCheckCode.push(codeItem);
          }
        }
      });
      if (flagCheckCode?.length > 0) {
        return res.status(HttpStatus.BAD_REQUEST).send({
          message:
            `"${flagCheckCode.join(', ').replace(/, ([^,]*)$/, ' and $1')}"` +
            ' not existing!',
        });
      }

      const arrTextHistory = [];
      const newBody = { ...body, ...objPropCodeFind };
      if (findModel?.model?.modelID !== newBody?.modelID) {
        arrTextHistory.push('Model');
        findModel.model = { modelID: newBody?.modelID } as ModelMold;
      }
      if (findModel.moldNo !== newBody?.moldNo) {
        arrTextHistory.push(`Mold No(#${newBody?.moldNo})`);
        findModel.moldNo = newBody?.moldNo;
      }
      if (
        newBody?.manufacturer?.companyID &&
        newBody?.manufacturer?.companyCode
      ) {
        if (
          newBody?.manufacturer?.companyID !==
          findModel?.manufacturer?.companyID
        ) {
          arrTextHistory.push('제작업체');
          findModel.manufacturer = newBody?.manufacturer as Company;
        }
      } else {
        findModel.manufacturer = null;
      }
      if (newBody?.shipArea?.companyID && newBody?.shipArea?.companyCode) {
        if (newBody?.shipArea?.companyID !== findModel?.shipArea?.companyID) {
          arrTextHistory.push('발송지역');
          findModel.shipArea = newBody?.shipArea as Company;
        }
      } else {
        findModel.shipArea = null;
      }

      if (
        newBody?.massCompany?.companyID &&
        newBody?.massCompany?.companyCode
      ) {
        if (
          newBody?.massCompany?.companyID !== findModel?.massCompany?.companyID
        ) {
          arrTextHistory.push('양산업체');
          findModel.massCompany = newBody?.massCompany as Company;
        }
      } else {
        findModel.massCompany = null;
      }

      if (isDateDifferent(findModel.shipDate, newBody?.shipDate)) {
        arrTextHistory.push('출고 계획');
        findModel.shipDate = newBody?.shipDate;
      }

      if (
        isDateDifferent(findModel.shipMassCompany, newBody?.shipMassCompany)
      ) {
        arrTextHistory.push('양산업체입고');
        findModel.shipMassCompany = newBody?.shipMassCompany;
      }

      let currentTryFind = findModel.historyTryNo.find(
        (item) => item?.historyTryNoId === newBody?.historyTryNoId,
      );

      //
      let checkIsUpdateTryNo = '';
      if (currentTryFind) {
        if (isDateDifferent(currentTryFind.outputEdit, newBody?.outputEdit)) {
          arrTextHistory.push('수리 출고');
          currentTryFind.outputEdit = newBody?.outputEdit;
        }

        if (
          isDateDifferent(
            currentTryFind.receivingCompleted,
            newBody?.receivingCompleted,
          )
        ) {
          arrTextHistory.push('입고 완료');
          currentTryFind.receivingCompleted = newBody?.receivingCompleted;
        }
        if (
          newBody?.modificationCompany?.companyID &&
          newBody?.modificationCompany?.companyCode
        ) {
          if (
            newBody?.modificationCompany?.companyID !==
            currentTryFind?.modificationCompany?.companyID
          ) {
            arrTextHistory.push('수정업체');
            currentTryFind.modificationCompany =
              newBody?.modificationCompany as Company;
          }
        } else {
          currentTryFind.modificationCompany = null;
        }
        if (
          isDateDifferent(newBody?.wearingPlan, currentTryFind?.wearingPlan)
        ) {
          arrTextHistory.push('입고 계획');
          currentTryFind.wearingPlan = newBody?.wearingPlan;
        }
        if (currentTryFind?.remark !== newBody?.historyEdit?.trim()) {
          arrTextHistory.push(`수정내역(T${newBody?.tryNo})`);
          currentTryFind.remark = newBody?.historyEdit?.trim();
        }
        if (currentTryFind?.tryNum !== newBody?.tryNo) {
          arrTextHistory.push(`Try No(T${newBody?.tryNo})`);
          currentTryFind.tryNum = newBody?.tryNo;
        }
        checkIsUpdateTryNo = 'UPDATE';
      } else {
        currentTryFind = {} as HistoryTryNo;
        checkIsUpdateTryNo = 'ADD';
        if (newBody?.outputEdit) {
          currentTryFind['outputEdit'] = newBody?.outputEdit;
          arrTextHistory.push(`수리 출고`);
        }
        if (newBody?.wearingPlan) {
          currentTryFind['wearingPlan'] = newBody?.wearingPlan;
          arrTextHistory.push(`입고 계획`);
        }
        if (newBody?.historyEdit) {
          currentTryFind['remark'] = newBody?.historyEdit;
          arrTextHistory.push(`수정내역`);
        }
        if (newBody?.modificationCompany) {
          currentTryFind['modificationCompany'] = newBody?.modificationCompany;
          arrTextHistory.push(
            `수정업체(${newBody?.modificationCompany?.companyCode})`,
          );
        }
        if (newBody?.tryNo) {
          currentTryFind['tryNum'] = newBody?.tryNo;
          arrTextHistory.push(`Try No(T${newBody?.tryNo})`);
        }
      }

      const savedModel = await this.repository.save(findModel);
      switch (checkIsUpdateTryNo) {
        case 'UPDATE':
          await this.historyTrynoService.update(
            { ...currentTryFind, outputJigID: savedModel?.outputJigID },
            request,
          );
          break;
        case 'ADD':
          await this.historyTrynoService.add(
            findModel,
            { ...currentTryFind, currentTry: true },
            request,
          );
          break;

        default:
          break;
      }
      if (arrTextHistory?.length > 0) {
        await this.historyService.add(
          findModel,
          {
            historyType: 'UPDATE',
            historyRemark: `${arrTextHistory.join(' ,')}`,
          },
          request,
        );
      }

      return res.status(HttpStatus.OK).send(findModel);
    }
    return res
      .status(HttpStatus.BAD_REQUEST)
      .send({ message: 'Not found record!' });
  }

  async changeStatus(body, request, res) {
    const { outputJigID, productionStatus } = body;
    if (outputJigID && productionStatus) {
      const find = await this.repository.findOneBy({ outputJigID });
      const oldStatus = find?.productionStatus;
      if (find) {
        let historyRemark = `${getStatusMoldName(oldStatus)} -> ${getStatusMoldName(productionStatus)}`;
        const departEdit = checkStatusOnChange(find?.productionStatus, productionStatus);
        console.log('departEdit',departEdit);
        
        if (departEdit !== 0) {
          const saveTry = await this.historyTrynoService.inCrementTryNum(
            outputJigID,
            departEdit,
            request,
          );
          if (saveTry) {
            const { newTryNum, oldTryNum } = saveTry;
            historyRemark += `(T${oldTryNum} -> T${newTryNum})`;
          }else {
            historyRemark += `(T0 -> T1)`
          }
        }
        find.productionStatus = productionStatus;
        await this.repository.save(find);

        await this.historyService.add(
          find,
          {
            historyType: 'UPDATE',
            historyRemark: historyRemark,
          },
          request,
        );
        return res.status(HttpStatus.OK).send({ message: 'Saved successful!' });
      }
    }
    return res
      .status(HttpStatus.BAD_REQUEST)
      .send({ message: 'Not found record!' });
  }

  async delete(body, request, res) {
    const { outputJigID } = body;
    if (outputJigID) {
      const promiss = this.historyTrynoService.delete(outputJigID);
      const promiss2 = this.historyService.delete(outputJigID);
      await Promise.all([promiss, promiss2]);
      await this.repository.delete({ outputJigID });
      return res.status(HttpStatus.OK).send({ message: 'Delete successful!' });
    }
    return res
      .status(HttpStatus.BAD_REQUEST)
      .send({ message: 'Not found record!' });
  }

  async history(res, request, body) {
    const { outputJigID } = body;
    const data = await this.historyService.findByOutputJig(outputJigID);
    return res.status(HttpStatus.OK).send(data);
  }
  async getAll2(body: any, showPaginate: boolean = true) {
    const {
      page,
      rowsPerPage,
      search,
      categoryFilter,
      modelFilter,
      statusFilter,
    } = body;

    const take = +rowsPerPage || 10;
    const newPage = +page || 0;
    const skip = newPage * take;

    let whereClause = 'outputJig.moldNo LIKE :search';
    const parameters: any = { search: `%${search}%` };

    // Apply search conditions for `model` fields
    if (search) {
      whereClause += ` OR model.projectName LIKE :search 
                      OR model.type LIKE :search 
                      OR model.model LIKE :search 
                      OR model.description LIKE :search`;
    }

    // Apply model filter if it exists
    if (modelFilter?.length > 0) {
      whereClause += ` AND model.modelID IN (:...modelFilter)`;
      parameters.modelFilter = modelFilter;
    } else if (categoryFilter?.length > 0) {
      // Apply category filter if `modelFilter` doesn't exist
      whereClause += ` AND model.category IN (:...categoryFilter)`;
      parameters.categoryFilter = categoryFilter;
    }

    // Apply status filter if it exists
    if (statusFilter?.length > 0) {
      whereClause += ` AND outputJig.productionStatus IN (:...statusFilter)`;
      parameters.statusFilter = statusFilter;
    }

    // QueryBuilder with filtering `historyTryNo` where `currentTry = true`
    const queryBuilder = this.repository
      .createQueryBuilder('outputJig')
      .leftJoinAndSelect('outputJig.model', 'model')
      .leftJoinAndSelect('outputJig.manufacturer', 'manufacturer')
      .leftJoinAndSelect('outputJig.shipArea', 'shipArea')
      .leftJoinAndSelect('outputJig.massCompany', 'massCompany')
      .leftJoinAndSelect('model.category', 'category')
      .leftJoinAndSelect(
        'outputJig.historyTryNo',
        'historyTryNo',
        'historyTryNo.currentTry = :currentTry', // Only include records where `currentTry` is true
        { currentTry: true },
      )
      .leftJoinAndSelect(
        'historyTryNo.modificationCompany',
        'modificationCompany',
      )
      .select([
        'outputJig.outputJigID',
        'outputJig.moldNo',
        'outputJig.shipMassCompany',
        'outputJig.shipDate',
        'outputJig.productionStatus',
        'model.modelID',
        'model.projectName',
        'model.type',
        'model.model',
        'model.description',
        'category.categoryId',
        'category.categoryName',
        'manufacturer.companyID',
        'manufacturer.companyCode',
        'manufacturer.companyName',
        'shipArea.companyID',
        'shipArea.companyCode',
        'shipArea.companyName',
        'massCompany.companyID',
        'massCompany.companyCode',
        'massCompany.companyName',
        'historyTryNo.historyTryNoId',
        'historyTryNo.tryNum',
        'historyTryNo.currentTry',
        'historyTryNo.remark',
        'historyTryNo.outputEdit',
        'historyTryNo.wearingPlan',
        'historyTryNo.receivingCompleted',
        'modificationCompany.companyID',
        'modificationCompany.companyCode',
        'modificationCompany.companyName',
      ])
      .where(whereClause, parameters)
      .orderBy('model.type', 'ASC')
      .addOrderBy('outputJig.moldNo', 'ASC');

    if (showPaginate) {
      queryBuilder.skip(skip).take(take);
    }
    const [data, total] = await queryBuilder.getManyAndCount();
    return { data, total };
  }
  async getAll(body, showPaginate = true) {
    const {
      page,
      rowsPerPage,
      search,
      categoryFilter,
      modelFilter,
      statusFilter,
    } = body;
    const take = +rowsPerPage || 10;
    const newPage = +page || 0;
    const skip = newPage * take;
    let arrWhere = [];
    const arrFieldWhere = ['moldNo'];
    const arrFieldModelWhere = ['projectName', 'type', 'model', 'description'];
    //search like
    arrFieldWhere.map((field) => {
      arrWhere.push({
        [field]: Like(`%${search}%`),
      });
    });
    //search like model
    arrFieldModelWhere.map((field) => {
      arrWhere.push({
        model: { [field]: Like(`%${search}%`) },
      });
    });
    if (modelFilter?.length > 0) {
      const newArrWhereModelTemp = arrWhere.map((item) => {
        return { ...item, model: { ...item?.model, modelID: In(modelFilter) } };
      });
      arrWhere = newArrWhereModelTemp;
    } else {
      if (categoryFilter?.length > 0) {
        const newArrWhereCateTemp = arrWhere.map((item) => {
          return {
            ...item,
            model: { ...item?.model, category: In(categoryFilter) },
          };
        });
        arrWhere = newArrWhereCateTemp;
      }
    }
    if (statusFilter?.length > 0) {
      const newArrWhere = arrWhere.map((itemWhere) => {
        return { ...itemWhere, productionStatus: In(statusFilter) };
      });
      arrWhere = newArrWhere;
    }

    const options = {
      where: arrWhere,
      select: {
        outputJigID: true,
        moldNo: true,
        shipMassCompany: true,
        shipDate: true,
        outputEdit: true,
        receivingCompleted: true,
        productionStatus: true,
        manufacturer: {
          companyID: true,
          companyCode: true,
          companyName: true,
        },
        shipArea: {
          companyID: true,
          companyCode: true,
          companyName: true,
        },
        massCompany: {
          companyID: true,
          companyCode: true,
          companyName: true,
        },
        modificationCompany: {
          companyID: true,
          companyCode: true,
          companyName: true,
        },
        wearingPlan: true,
        model: {
          modelID: true,
          projectName: true,
          type: true,
          model: true,
          description: true,
          category: {
            categoryId: true,
            categoryName: true,
          },
        },
      },
      skip: skip,
      take: take,
      relations: [
        'manufacturer',
        'shipArea',
        'massCompany',
        'modificationCompany',
        'model',
        'model.category',
        'historyTryNo',
      ],
      order: { model: { type: 'ASC' }, moldNo: 'ASC' },
    };

    if (showPaginate) {
      const [data, total] = await this.repository.findAndCount(
        options as FindManyOptions<OutputJig>,
      );
      return { data, total };
    } else {
      delete options.skip;
      delete options.take;
      const data = await this.repository.find(
        options as FindManyOptions<OutputJig>,
      );
      return { data, total: 0 };
    }
  }

  async exportExcel(res, request, body) {
    const result = await this.getAll2(body, false);
    const arrModel = [];
    const arrModelIndex = [];
    result?.data?.map((item, index) => {
      const mixModelType =
        item?.model?.type +
        item?.model?.model +
        item?.model?.category?.categoryId;
      if (!arrModel?.includes(mixModelType)) {
        arrModel.push(mixModelType);
        arrModelIndex.push(index + 2);
      }
    });
    const workbook = new ExcelJS.Workbook();
    workbook.modified = new Date();
    const worksheet = workbook.addWorksheet('Sheet1');
    worksheet.columns = LIST_COL_MOLD_REPORT;
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '90c3a0' }, // Green color
      };
    });
    worksheet.properties.defaultRowHeight = 15;
    for (let index = 0; index < result?.data.length; index++) {
      const item = result?.data[index];

      await worksheet.addRow({
        ...item,
        manufacturer: item?.manufacturer?.companyCode,
        shipArea: item?.shipArea?.companyCode,
        massCompany: item?.massCompany?.companyCode,
        // modificationCompany: item?.modificationCompany?.companyCode,
        // wearingPlan: formatDateFromDB(item?.wearingPlan,false),
        category: item?.model?.category?.categoryName,
        model: item?.model?.model,
        project: item?.model?.projectName,
        type: item?.model?.type,
        description: item?.model?.description,
        productionStatus: getStatusMoldName(item?.productionStatus),
        shipDate: formatDateFromDB(item?.shipDate, false),
        shipMassCompany: formatDateFromDB(item?.shipMassCompany, false),
        // outputEdit: formatDateFromDB(item?.outputEdit, false),
        // receivingCompleted: formatDateFromDB(item?.receivingCompleted, false),
        moldNo: item?.moldNo ? `#${item?.moldNo}` : '',
        tryNo: item?.historyTryNo[0] ? `T${item?.historyTryNo[0]?.tryNum}` : '',
        historyEdit: item?.historyTryNo[0]
          ? `${item?.historyTryNo[0]?.remark}`
          : '',
      });
    }

    // // Căn giữa và thêm border cho các ô có dữ liệu
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true,
        };
        if (
          rowNumber !== 1 &&
          !arrModelIndex.includes(rowNumber) &&
          colNumber < 5
        ) {
          cell.font = { color: { argb: '969696' } };
        }
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    res.status(HttpStatus.OK);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=' + 'ReportABC.xlsx',
    );
    res.end(buffer);
  }

  async findOneToExportExcel(id: any) {
    if (id) {
    }
    return [];
  }

  async exportExcelByID(res, request, body) {
    const { outputJigID } = body;
    const result = await this.repository.findOne({
      select: {
        outputJigID: true,
        moldNo: true,
        shipMassCompany: true,
        shipDate: true,
        historyTryNo: {
          historyTryNoId: true,
          tryNum: true,
          currentTry: true,
          receivingCompleted: true,
          outputEdit: true,
          departEdit: true,
          wearingPlan: true,
          remark: true,
          modificationCompany: {
            companyID: true,
            companyCode: true,
          },
        },
        manufacturer: {
          companyID: true,
          companyCode: true,
        },
        shipArea: {
          companyID: true,
          companyCode: true,
        },
        massCompany: {
          companyID: true,
          companyCode: true,
        },
        model: {
          modelID: true,
          projectName: true,
          type: true,
          model: true,
          description: true,
          category: { categoryId: true, categoryName: true },
        },
      },
      where: { outputJigID },
      relations: [
        'historyTryNo',
        'historyTryNo.modificationCompany',
        'manufacturer',
        'shipArea',
        'massCompany',
        'model',
        'model.category',
      ],
    });
    const workbook = new ExcelJS.Workbook();
    workbook.modified = new Date();
    const worksheet = workbook.addWorksheet('Sheet1');
    worksheet.columns = LIST_COL_MOLD_REPORT_ID;
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '90c3a0' }, // Green color
      };
    });
    worksheet.properties.defaultRowHeight = 15;
    for (let index = 0; index < result?.historyTryNo.length; index++) {
      const item = result?.historyTryNo[index];
      await worksheet.addRow({
        manufacturer: result?.manufacturer?.companyCode,
        shipArea: result?.shipArea?.companyCode,
        massCompany: result?.massCompany?.companyCode,
        modificationCompany: item?.modificationCompany?.companyCode,
        wearingPlan: formatDateFromDB(item?.wearingPlan, false),
        category: result?.model?.category?.categoryName,
        model: result?.model?.model,
        project: result?.model?.projectName,
        type: result?.model?.type,
        description: result?.model?.description,
        shipDate: formatDateFromDB(result?.shipDate, false),
        shipMassCompany: formatDateFromDB(result?.shipMassCompany, false),
        outputEdit: formatDateFromDB(item?.outputEdit, false),
        receivingCompleted: formatDateFromDB(item?.receivingCompleted, false),
        moldNo: result?.moldNo ? `#${result?.moldNo}` : '',
        tryNo: item?.tryNum ? `T${item?.tryNum}` : '',
        historyEdit: item?.remark ?? '',
        departEdit: item?.departEdit ? getDepartmentEditMold(item?.departEdit) : '',
      });
    }
    // // Căn giữa và thêm border cho các ô có dữ liệu
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true,
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    });
    const buffer = await workbook.xlsx.writeBuffer();
    res.status(HttpStatus.OK);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=' + 'ReportABC.xlsx',
    );
    res.end(buffer);
  }
}
