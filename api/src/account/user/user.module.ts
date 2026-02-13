import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserRepository } from './user.repository';
import { UserWebController } from './user-web.controller';
import { UserAppController } from './user-app.controller';

@Module({
  controllers: [UserWebController, UserAppController],
  providers: [UserService, UserRepository],
  exports: [UserService, UserRepository],
})
export class UserModule {}
