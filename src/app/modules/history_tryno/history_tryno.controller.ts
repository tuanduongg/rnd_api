import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { HistoryTryNoService } from './history_tryno.service';
import { AuthGuard } from '../auth/auth.guard';


@Controller('history-try-no')
export class HistoryTryNoController {
    constructor(
        private service: HistoryTryNoService
    ) {

    }
    @UseGuards(AuthGuard)
    @Post('/find-by-outputjig')
    async findByOutputJig(@Res() res: Response, @Body() body) {
      return await this.service.findByOutputJig(body,  res);
    }

}