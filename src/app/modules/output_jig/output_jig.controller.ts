import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { OutputJigService } from './output_jig.service';
import { AuthGuard } from '../auth/auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';

@Controller('output-jig')
export class OutputJigController {
  constructor(private service: OutputJigService) {}

  @UseGuards(AuthGuard)
  @Post('/all')
  async all(@Res() res: Response, @Req() request: Request, @Body() body) {
    return await this.service.all(body, request, res);
  }

  @UseGuards(AuthGuard)
  @Post('/add')
  async add(@Res() res: Response, @Req() request: Request, @Body() body) {
    return await this.service.add(body, request, res);
  }

  @UseGuards(AuthGuard)
  @Post('/update')
  async update(@Res() res: Response, @Req() request: Request, @Body() body) {
    return await this.service.update(body, request, res);
  }

  @UseGuards(AuthGuard)
  @Post('/change-status')
  async changeStatus(
    @Res() res: Response,
    @Req() request: Request,
    @Body() body,
  ) {
    return await this.service.changeStatus(body, request, res);
  }

  @UseGuards(AuthGuard)
  @Post('/delete')
  async delete(@Res() res: Response, @Req() request: Request, @Body() body) {
    return await this.service.softDelete(body, request, res);
  }

  @UseGuards(AuthGuard)
  @Post('/history')
  async history(@Res() res: Response, @Req() request: Request, @Body() body) {
    return await this.service.history(res, request, body);
  }

  @UseGuards(AuthGuard)
  @Post('/export-history')
  async exportHistory(
    @Res() res: Response,
    @Req() request: Request,
    @Body() body,
  ) {
    return await this.service.exportHistory(res, request, body);
  }

  @UseGuards(AuthGuard)
  @Post('/export-excel')
  async exportExcelReport(
    @Res() res: Response,
    @Req() request: Request,
    @Body() body,
  ) {
    return await this.service.exportExcel(res, request, body);
  }

  @UseGuards(AuthGuard)
  @Post('/export-excel-id')
  async exportExcelByID(
    @Res() res: Response,
    @Req() request: Request,
    @Body() body,
  ) {
    return await this.service.exportExcelByID(res, request, body);
  }


  @UseGuards(AuthGuard)
  @Post('/importExcelFile')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: path.join(
          process.env.UPLOAD_FOLDER || './public',
          './import',
        ), // Save the file temporarily
        filename: (req, file, callback) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = path.extname(file.originalname);
          callback(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
        },
      }),
    }),
  )
  async importExcelFile(
    @Res() res: Response,
    @Req() request: Request,
    @UploadedFile() file: Express.Multer.File
  ) {
    return await this.service.importExcelFile(res,request,file?.path);
  }

  @UseGuards(AuthGuard)
  @Post('/exportExcelDetailList')
  async exportExcelDetailList(
    @Res() res: Response,
    @Req() request: Request,
    @Body() body,
  ) {
    return await this.service.exportExcelDetailList(res, request, body);
  }

  @UseGuards(AuthGuard)
  @Get('/sampleFile')
  async getSampleFile(
    @Res() res: Response
  ) {
    return await this.service.getSampleFile(res);
  }
}
