import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.service';
import { User } from '@prisma/client';
import { ResponseUserDto, UpdateUserDto } from './user.dto';
import { JwtAuthGuard } from '../auth/jwt';

@Controller('desktop-app/users')
export class UserAppController {
  constructor(private readonly userService: UserService) {}

  /**
   * 닉네임으로 사용자 조회
   * @param nickname
   * @returns
   */
  @Get(':nickname')
  async getUser(@Param('nickname') nickname: string): Promise<ResponseUserDto> {
    if (!nickname) {
      throw new BadRequestException('Nickname parameter is required');
    }
    return await this.userService.getUserByNickname(nickname);
  }

  /**
   * 본인 정보 수정
   * @param req
   * @param updateUserDto
   * @returns
   */
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateUser(
    @Request() req: { user: User },
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<ResponseUserDto> {
    return this.userService.updateUser(req.user.id, updateUserDto);
  }
}
