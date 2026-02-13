import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { ResponseUserDto, UpdateUserDto } from './user.dto';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  // ===== READ =====
  async getUserById(id: string): Promise<ResponseUserDto> {
    const user = await this.findUserById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async getUserByNickname(nickname: string): Promise<ResponseUserDto> {
    const user = await this.userRepository.findByNickname(nickname);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  // ===== UPDATE =====
  async updateUser(
    id: string,
    updateUserDto: UpdateUserDto,
  ): Promise<ResponseUserDto> {
    await this.getUserById(id);
    const updatedUser = await this.userRepository.updateUser(id, updateUserDto);
    if (!updatedUser) {
      throw new Error('Failed to update user');
    }
    return updatedUser;
  }

  // ===== Sub Functions =====

  async findUserById(id: string): Promise<ResponseUserDto | null> {
    return await this.userRepository.findById(id);
  }

  async isExistingNickname(
    nickname: string,
    userId?: string,
  ): Promise<boolean> {
    const user = await this.userRepository.findByNickname(nickname);
    // 본인 이름일 경우는 제외
    if (user && userId && user.id === userId) {
      return false;
    }
    return !!user;
  }
}
