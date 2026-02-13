import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth.service';
import { UserService } from '../../user/user.service';
import { AuthRepository } from '../auth.repository';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { AuthProvider } from '../auth.entity';
import { InternalServerErrorException } from '@nestjs/common';

describe('AuthService - validateGoogleUser()', () => {
  let authService: AuthService;
  let userService: Partial<UserService>;
  let authRepository: Partial<AuthRepository>;
  let jwtService: Partial<JwtService>;
  let dataSource: Partial<DataSource>;
  let queryRunner: any;

  const googleUser = {
    id: 'google-id-123',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    picture: 'http://example.com/pic.jpg',
  };

  const mockUser = {
    id: 1,
    email: googleUser.email,
    name: 'John Doe',
    nickname: 'test',
    profilePicture: googleUser.picture,
    isActive: true,
  };

  const mockAuth = {
    provider: AuthProvider.GOOGLE,
    user: mockUser,
  };

  beforeEach(async () => {
    userService = {
      findByEmail: jest.fn(),
    };

    authRepository = {
      findAuthByUserId: jest.fn(),
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('fake-jwt-token'),
    };

    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        save: jest.fn(),
      },
    };

    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: userService },
        { provide: AuthRepository, useValue: authRepository },
        { provide: JwtService, useValue: jwtService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    authService = module.get(AuthService);
    (authService as any).findAuthByUserId = jest.fn(); // 직접 mocking
  });

  it('✅ 1. Registers and logs in a new user', async () => {
    (userService.findByEmail as jest.Mock).mockResolvedValue(null);
    queryRunner.manager.save
      .mockResolvedValueOnce(mockUser)
      .mockResolvedValueOnce(mockAuth);

    const result = await authService.validateGoogleUser(googleUser);

    expect(result).toEqual({ accessToken: 'fake-jwt-token', user: mockUser });
    expect(queryRunner.startTransaction).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });

  it('✅ 2. Logs in if user exists and provider is GOOGLE', async () => {
    (userService.findByEmail as jest.Mock).mockResolvedValue(mockUser);
    (authService as any).findAuthByUserId.mockResolvedValue(mockAuth);

    const result = await authService.validateGoogleUser(googleUser);

    expect(result).toEqual({ accessToken: 'fake-jwt-token', user: mockUser });
  });

  it('❌ 3. Throws if user exists but provider is not GOOGLE', async () => {
    (userService.findByEmail as jest.Mock).mockResolvedValue(mockUser);
    (authService as any).findAuthByUserId.mockResolvedValue({
      provider: AuthProvider.LOCAL,
    });

    await expect(authService.validateGoogleUser(googleUser)).rejects.toThrow(
      `"${googleUser.email}" already exists with a different login method.`,
    );
  });

  it('❌ 4. Throws if user exists but has no auth record', async () => {
    (userService.findByEmail as jest.Mock).mockResolvedValue(mockUser);
    (authService as any).findAuthByUserId.mockResolvedValue(null);

    await expect(authService.validateGoogleUser(googleUser)).rejects.toThrow(
      `"${googleUser.email}" has no auth record.`,
    );
  });

  it('❌ 5. Rolls back and throws if error occurs during transaction', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (userService.findByEmail as jest.Mock).mockResolvedValue(null);
    queryRunner.manager.save.mockRejectedValue(new Error('DB Error'));

    await expect(authService.validateGoogleUser(googleUser)).rejects.toThrow(
      new InternalServerErrorException('Failed Google OAuth registration'),
    );

    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });
});
