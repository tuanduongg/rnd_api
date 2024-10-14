import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CategoryConceptService } from './category_concept.service';
import { IsVNGuard } from 'src/core/guards/isVN.guard';

@Controller('category-concept')
export class CategoryConceptController {
  constructor(private service: CategoryConceptService) {}

  @UseGuards(AuthGuard)
  @Get('/all')
  async all() {
    return await this.service.all();
  }

  @UseGuards(IsVNGuard)
  @UseGuards(AuthGuard)
  @Post('/statisticReportQC')
  async statisticReportQC(
    @Res() res: Response,
    @Req() request: Request,
    @Body() body,
  ) {
    return await this.service.statisticReportQC(res, request, body);
  }
}
