import {
  Controller,
  Get,
  UseGuards,
  Req,
  Res,
  UseFilters,
  Post,
  Request,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { AuthenticatedRequest, RequestWithCookies } from './auth.dto';
import { GoogleAuthExceptionFilter } from './filters/google-auth-exception.filter';
import { RateLimitGuard } from 'src/common/guards/rate-limit.guard';
import { JwtAuthGuard } from './jwt';
import { ResponseUserDto } from '../user/user.dto';

@Controller('web/auth')
export class AuthWebController {
  constructor(private readonly authService: AuthService) {}

  // ===== Get My Info =====

  /**
   * Get current user information (web)
   * @param req Request with authenticated user
   * @returns Current user data
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(
    @Request() req: { user: ResponseUserDto },
  ): Promise<ResponseUserDto> {
    // JwtAuthGuard를 사용하여 findUserBySub에 의해서
    // req.user는 user의 최신 정보이며 password 정보 없음
    return req.user;
  }

  /**
   * Delete user account (soft delete)
   * @param req Request with authenticated user
   * @param res Response object
   * @returns Success status
   */
  @Post('delete-account')
  @UseGuards(JwtAuthGuard)
  async deleteUserAccount(
    @Req() req: RequestWithCookies & { user: ResponseUserDto },
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.id;

    try {
      // Delete user account
      const result = await this.authService.deleteUserAccount(userId);

      // Blacklist current tokens to immediately invalidate session
      const accessToken = req.cookies?.accessToken;
      const refreshToken = req.cookies?.refreshToken;

      if (accessToken || refreshToken) {
        await this.authService.tokenPairToBlacklist(accessToken, refreshToken);
      }

      // Clear authentication cookies
      this.authService.clearAuthCookies(res);

      // Send success response
      res.json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message || '계정 삭제에 실패했습니다.',
      });
    }
  }

  // ===== Google OAuth Web =====

  /**
   * Initiate Google OAuth for web
   */
  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // 웹용 Google OAuth 시작점
  }

  /**
   * Handle Google OAuth callback for web
   * @param req Authenticated request with user data
   * @param res Response object
   */
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @UseFilters(GoogleAuthExceptionFilter)
  googleCallbackWeb(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    const user = req.user.user;
    const tokens = this.authService.generateTokenPair(user);

    // HTTPOnly 쿠키에 토큰 설정
    this.authService.setAuthCookies(res, tokens);
    const frontendUrl = process.env.FRONTEND_URL;

    res.redirect(`${frontendUrl}/`);
  }

  // ===== Common Login =====

  // ===== Token Management APIs =====

  /**
   * Refresh token pair for web (cookie-based)
   * @param req Request with cookies
   * @param res Response object
   * @returns Success status with new tokens set as cookies
   */
  @Post('refresh')
  @UseGuards(RateLimitGuard)
  async refresh(@Req() req: RequestWithCookies, @Res() res: Response) {
    const refreshToken = req.cookies?.refreshToken;
    const accessToken = req.cookies?.accessToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'No refresh token provided.',
      });
    }

    // First validate and refresh tokens
    const result = await this.authService.refreshTokenPair(refreshToken, true); // Allow internal blacklisting

    // Blacklist old access token separately if it exists
    if (accessToken && result.success) {
      await this.authService.accessTokenToBlacklist(accessToken);
    }

    if (!result.success) {
      return res.status(401).json({
        success: false,
        message: result.message,
      });
    }

    // Set both new tokens to HttpOnly cookies
    if (result.tokens) {
      this.authService.setAuthCookies(res, result.tokens);
    }

    return res.json({
      success: true,
      message: 'Tokens refreshed successfully',
    });
  }

  /**
   * Logout for web (cookie-based)
   * @param req Request with cookies
   * @param res Response object
   * @returns Success status
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: RequestWithCookies, @Res() res: Response) {
    // Blacklist current tokens
    const accessToken = req.cookies?.accessToken;
    const refreshToken = req.cookies?.refreshToken;

    await this.authService.tokenPairToBlacklist(accessToken, refreshToken);

    // Clear all authentication-related cookies
    this.authService.clearAuthCookies(res);

    return res.json({
      success: true,
      message: 'Logged out successfully',
    });
  }
}
