import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

interface GoogleProfile {
  id: string;
  name: {
    givenName: string;
    familyName: string;
  };
  emails: Array<{
    value: string;
    verified: boolean;
  }>;
  photos: Array<{
    value: string;
  }>;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID') || '',
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET') || '',
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL') || '',
      scope: ['email', 'profile'],
    });
  }
  async validate(
    accessToken: string,
    refreshToken: string,
    profile: GoogleProfile,
    done: VerifyCallback,
  ): Promise<any> {
    try {
      const { id, name, emails, photos } = profile;

      const googleUser = {
        id,
        email: emails[0]?.value || '',
        firstName: name?.givenName || '',
        lastName: name?.familyName || '',
        picture: photos[0]?.value || '',
      };

      const result = await this.authService.validateGoogleUser(googleUser);

      done(null, result);
    } catch (error: any) {
      // Pass error to the callback so it can be handled by the controller
      done(error, false);
    }
  }
}

@Injectable()
export class GoogleDesktopStrategy extends PassportStrategy(
  Strategy,
  'google-desktop',
) {
  constructor(
    private configService: ConfigService, // private 키워드는 유지하되, super 이전에는 this 접근 불가하므로 인자로 접근
    private authService: AuthService,
  ) {
    // [로그 추가를 위해 변수로 먼저 추출 - 로직 변경 없음]
    const clientID =
      configService.get<string>('GOOGLE_CLIENT_DESKTOPAPP_ID') || '';
    const clientSecret =
      configService.get<string>('GOOGLE_CLIENT_DESKTOPAPP_SECRET') || '';
    const callbackURL =
      configService.get<string>('GOOGLE_CALLBACK_DESKTOPAPP_URL') || '';

    super({
      clientID: clientID,
      clientSecret: clientSecret,
      callbackURL: callbackURL,
      scope: ['email', 'profile'],
    });
  }
  async validate(
    accessToken: string,
    refreshToken: string,
    profile: GoogleProfile,
    done: VerifyCallback,
  ): Promise<any> {
    try {
      const { id, name, emails, photos } = profile;

      const googleUser = {
        id,
        email: emails[0]?.value || '',
        firstName: name?.givenName || '',
        lastName: name?.familyName || '',
        picture: photos[0]?.value || '',
      };

      const result = await this.authService.validateGoogleUser(googleUser);

      done(null, result);
    } catch (error: any) {
      // Pass error to the callback so it can be handled by the controller
      done(error, false);
    }
  }
}
