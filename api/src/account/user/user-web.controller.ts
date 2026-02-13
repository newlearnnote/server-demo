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

@Controller('web/users')
export class UserWebController {
  constructor(private readonly userService: UserService) {}

  /**
   * 파라미터로 닉네임을 받아서 해당 사용자의 정보 반환
   * 웹에서 사용자 프로필 페이지 접속 시 호출되는 엔드포인트
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
