import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { TypeOrmModule, TypeOrmModuleAsyncOptions } from '@nestjs/typeorm';
import { ConnectionOptions, createConnection } from 'typeorm';
import { UsersModule } from './modules/users/users.module';
import { ConfigDB } from 'src/database/configDB';
import { User } from 'src/database/entity/user.entity';
import { Role } from 'src/database/entity/role.entity';
import { CategoryConcept } from 'src/database/entity/category_concept.entity';
import { Concept } from 'src/database/entity/concept.entity';
import { HistoryConcept } from 'src/database/entity/history_concept.entity';
import { FileConcept } from 'src/database/entity/file_concept.entity';
import { CategoryConceptModule } from './modules/category_concept/category_concept.module';
import { RoleModule } from './modules/role/role.module';
import { ConceptModule } from './modules/concept/concept.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ProcessQC } from 'src/database/entity/process_qc.entity';
import { ReportQC } from 'src/database/entity/report_qc.entity';
import { FileReportQC } from 'src/database/entity/file_reportQC.entity';
import { ProcessQCModule } from './modules/process_qc/process_qc.module';
import { ReportQCModule } from './modules/report_qc/report_qc.module';
import { FileReportQCModule } from './modules/file_reportQC/file_reportQC.module';
import { Company } from 'src/database/entity/company.entity';
import { ModelMold } from 'src/database/entity/model_mold.entity';
import { ModelMoldModule } from './modules/model_mold/model_mold.module';
import { CompanyModule } from './modules/company/company.module';
import { OutputJig } from 'src/database/entity/output_jig.entity';
import { OutputJigModule } from './modules/output_jig/output_jig.module';
import { HistoryOutJigModule } from './modules/history_out_jig/history_concept.module';
import { HistoryOutJig } from 'src/database/entity/history_out_jig.entity';
import { HistoryTryNo } from 'src/database/entity/history_tryno.entity';
import { HistoryTryNoModule } from './modules/history_tryno/history_tryno.module';
import { NotificationModule } from './modules/notification/notification.module';
import { Notification } from 'src/database/entity/notification.entity';
import { LogIPMiddleware } from 'src/core/middlewares/LogIP.middleware';
import { DetailMoldBeforeModule } from './modules/detail_mold_before/detail_mold_before.module';
import { DetailMoldAfterModule } from './modules/detail_mold_after/detail_mold_after.module';
import { DetailMoldAfter } from 'src/database/entity/detail_mold_after.entity';
import { DetailMoldBefore } from 'src/database/entity/detail_mold_before.entity';
// import { InOutJIGModule } from './modules/intout_jig/inout_jig.module';
import { ScheduleModule } from '@nestjs/schedule';
import { Permission } from 'src/database/entity/permisstion.entity';
import { ListAPI } from 'src/database/entity/list_api.entity';
import { ListAPIModule } from './modules/list_api/list_api.module';
import { PermissionModule } from './modules/permission/permission.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
    }),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      useFactory: async (): Promise<ConnectionOptions> => {
        const connectionOptions: ConnectionOptions = {
          type: 'mssql',
          host: ConfigDB?.host,
          port: ConfigDB?.port,
          username: ConfigDB?.username,
          password: ConfigDB?.password,
          database: ConfigDB?.database,
          options: {
            trustServerCertificate: true,
            enableArithAbort: true,
            encrypt: false,
          }, //for mssql
          entities: [
            User,
            Role,
            CategoryConcept,
            Concept,
            HistoryConcept,
            FileConcept,
            ProcessQC,
            ReportQC,
            FileReportQC,
            Company,
            ModelMold,
            OutputJig,
            HistoryOutJig,
            HistoryTryNo,
            Notification,
            DetailMoldAfter,
            DetailMoldBefore,
            Permission,
            ListAPI,
          ],
          requestTimeout: 30000, //for mssql
          synchronize: true,
          pool: {
            //for mssql
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000,
          },
        };
        const connection = await createConnection(connectionOptions);
        console.log(
          `Connected to the database:${connection.options.database}:${connectionOptions.username}-${connectionOptions.host}:${connectionOptions.port}`,
        );
        return connectionOptions;
      },
    } as TypeOrmModuleAsyncOptions),
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    CategoryConceptModule,
    RoleModule,
    ConceptModule,
    ProcessQCModule,
    ReportQCModule,
    FileReportQCModule,
    ModelMoldModule,
    CompanyModule,
    OutputJigModule,
    HistoryOutJigModule,
    HistoryTryNoModule,
    NotificationModule,
    DetailMoldBeforeModule,
    DetailMoldAfterModule,
    PermissionModule,
    ListAPIModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
// export class AppModule implements NestModule {
//   configure(consumer: MiddlewareConsumer) {
//     consumer.apply(LogIPMiddleware).forRoutes(
//       { path: 'auth/login', method: RequestMethod.POST }, // Áp dụng cho route GET /login
//     );
//     // .forRoutes('*'); // Áp dụng middleware cho tất cả các route
//   }
// }
