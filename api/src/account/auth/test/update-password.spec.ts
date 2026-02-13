import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth.service';
import { UserService } from '../../user/user.service';
import { AuthRepository } from '../auth.repository';
import * as bcrypt from 'bcrypt';
import { AuthProvider } from '../auth.entity';
import { UpdatePasswordDto } from 'src/user/user.dto';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';

describe('AuthService - updatePassword()', () => {
  let authService: AuthService;
  let userService: Partial<UserService>;
  let authRepository: Partial<AuthRepository>;

  beforeEach(async () => {
    userService = {
      findWithPasswordById: jest.fn(),
      updatePassword: jest.fn(),
    };

    authRepository = {
      findAuthByUserId: jest.fn(),
    };

    const jwtService = {
      sign: jest.fn().mockReturnValue('fake-jwt-token'),
    };

    const mockDataSource = {
      createQueryRunner: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: userService },
        { provide: AuthRepository, useValue: authRepository },
        { provide: JwtService, useValue: jwtService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    authService = module.get(AuthService);
  });

  const validUser = { id: 1, password: 'hashed-old' };
  const validAuth = { provider: AuthProvider.LOCAL };

  const validDto: UpdatePasswordDto = {
    oldPassword: 'OldPass1!',
    newPassword: 'NewPass1!',
  };

  it('✅ 1. Successfully changes the password', async () => {
    (userService.findWithPasswordById as jest.Mock).mockResolvedValue(
      validUser,
    );
    (authRepository.findAuthByUserId as jest.Mock).mockResolvedValue(validAuth);
    (jest.spyOn(bcrypt, 'compare') as jest.Mock).mockResolvedValue(true);
    (jest.spyOn(bcrypt, 'hash') as jest.Mock).mockResolvedValue('hashed-new');
    (userService.updatePassword as jest.Mock).mockResolvedValue({ id: 1 });

    const result = await authService.updatePassword(1, validDto);

    expect(result).toEqual({ id: 1 });
    expect(bcrypt.compare).toHaveBeenCalledWith('OldPass1!', 'hashed-old');
    expect(bcrypt.hash).toHaveBeenCalledWith('NewPass1!', 10);
    expect(userService.updatePassword).toHaveBeenCalledWith(1, 'hashed-new');
  });

  it('❌ 2. Throws if user does not exist', async () => {
    (userService.findWithPasswordById as jest.Mock).mockResolvedValue(null);

    await expect(authService.updatePassword(1, validDto)).rejects.toThrow(
      'User with ID 1 not found.',
    );
  });

  it('❌ 3. Throws if provider is not LOCAL', async () => {
    (userService.findWithPasswordById as jest.Mock).mockResolvedValue(
      validUser,
    );
    (authRepository.findAuthByUserId as jest.Mock).mockResolvedValue({
      provider: AuthProvider.GOOGLE,
    });

    await expect(authService.updatePassword(1, validDto)).rejects.toThrow(
      'Password update is only allowed for local accounts.',
    );
  });

  it('❌ 4. Throws if old password is incorrect', async () => {
    (userService.findWithPasswordById as jest.Mock).mockResolvedValue(
      validUser,
    );
    (authRepository.findAuthByUserId as jest.Mock).mockResolvedValue(validAuth);
    (jest.spyOn(bcrypt, 'compare') as jest.Mock).mockResolvedValue(false);

    await expect(authService.updatePassword(1, validDto)).rejects.toThrow(
      'Old password is incorrect.',
    );
  });
});
