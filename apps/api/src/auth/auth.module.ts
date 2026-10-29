import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import type { Env } from '../config/env.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';

const JWT_ALGORITHM = 'HS256';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): JwtModuleOptions => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: { algorithm: JWT_ALGORITHM, expiresIn: config.get('JWT_EXPIRES_IN_SECONDS', { infer: true }) },
        verifyOptions: { algorithms: [JWT_ALGORITHM] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService],
  // JwtAuthGuard is instantiated in each consuming module and needs JwtService there.
  exports: [JwtModule],
})
export class AuthModule {}
