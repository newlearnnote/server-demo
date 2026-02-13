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
import { AuthenticatedRequest } from './auth.dto';
import { GoogleAuthExceptionFilter } from './filters/google-auth-exception.filter';
import { RateLimitGuard } from 'src/common/guards/rate-limit.guard';
import { JwtAuthGuard } from './jwt';
import { ResponseUserDto } from '../user/user.dto';

@Controller('desktop-app/auth')
export class AuthAppController {
  constructor(private readonly authService: AuthService) {}

  // ===== Get My Info =====

  /**
   * Get current user information (desktop)
   * @param req Request with authenticated user
   * @returns Current user data
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMeDesktop(
    @Request() req: { user: ResponseUserDto },
  ): Promise<ResponseUserDto> {
    return req.user;
  }

  /**
   * Initiate Google OAuth for desktop
   * @param res Response object
   */
  @Get('google')
  @UseGuards(AuthGuard('google-desktop'))
  async googleAuthDesktop(@Res() res: Response) {
    // 데스크톱 앱용 Google OAuth 시작점
    // 콜백 URL을 데스크톱 전용으로 설정
  }

  /**
   * Handle Google OAuth callback for desktop
   * @param req Authenticated request with user data
   * @param res Response object
   * @returns Redirect to desktop app with tokens
   */
  @Get('google/callback')
  @UseGuards(AuthGuard('google-desktop'))
  @UseFilters(GoogleAuthExceptionFilter)
  async googleCallbackDesktop(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const { user } = req.user;
    const tokens = await this.authService.createDesktopTokens(user);

    // 딥링크로 데스크톱 앱에 토큰 전달
    const deepLinkUrl = `newlearnnote://auth/callback?accessToken=${encodeURIComponent(tokens.accessToken)}&refreshToken=${encodeURIComponent(tokens.refreshToken)}`;

    return res.redirect(deepLinkUrl);
  }

  // ===== Common Login =====

  // ===== Token Management APIs =====

  /**
   * Refresh token pair for desktop (header-based)
   * @param req Request with Authorization header and X-Refresh-Token header
   * @param res Response object
   * @returns JSON response with new tokens
   */
  @Post('refresh')
  @UseGuards(RateLimitGuard)
  async refreshDesktop(@Req() req: Request, @Res() res: Response) {
    // Extract tokens from headers
    const authHeader = req.headers['authorization'] as string | undefined;
    const accessToken = authHeader?.replace('Bearer ', '');
    const refreshToken = req.headers['x-refresh-token'] as string | undefined;

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

    return res.json({
      success: true,
      accessToken: result.tokens?.accessToken,
      refreshToken: result.tokens?.refreshToken,
      message: 'Tokens refreshed successfully',
    });
  }

  /**
   * Logout for desktop (header-based)
   * @param req Request with authorization header and X-Refresh-Token header
   * @param res Response object
   * @returns Success status
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logoutDesktop(
    @Request() req: Request & { user: ResponseUserDto },
    @Res() res: Response,
  ) {
    try {
      // Extract tokens from headers
      const authHeader = req.headers['authorization'] as string | undefined;
      const accessToken = authHeader?.replace('Bearer ', '');
      const refreshToken = req.headers['x-refresh-token'] as string | undefined;

      // Blacklist both tokens
      await this.authService.tokenPairToBlacklist(accessToken, refreshToken);

      return res.json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      console.error('Desktop logout error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
}
