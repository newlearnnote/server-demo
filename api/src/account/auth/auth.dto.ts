import { ResponseUserDto } from '../user/user.dto';

/** Cookie type definition */
export interface AuthCookies {
  accessToken?: string;
  refreshToken?: string;
}

/** Request interface with cookies */
export interface RequestWithCookies extends Request {
  cookies: AuthCookies;
}

/** Google OAuth authenticated request interface */
export interface AuthenticatedRequest extends Request {
  user: AuthResult; // Receives AuthResult instead of GoogleUser
}

export interface GoogleUser {
  id: string; // Google OAuth ID
  email: string;
  firstName: string;
  lastName: string;
  picture: string;
}

/** JWT payload type definition */
export interface JwtPayload {
  sub: string; // User ID
  email?: string;
  type: 'access' | 'refresh';
  jti: string; // JWT ID (for blacklist)
  iat?: number;
  exp?: number;
}
/** Authentication result interface */
export interface AuthResult {
  accessToken: string;
  user: ResponseUserDto;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// Google Strategy에서 내부적으로 생성 (HTTP 요청 아님)
export interface CreateGoogleUserDto {
  oauthId: string; // Google OAuth ID
  email: string;
  firstName: string;
  lastName: string;
}

export interface CreateProfileDto {
  nickname: string;
  avatarUrl: string;
}
