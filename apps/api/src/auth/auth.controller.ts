import {
  AuthCredentialsSchema,
  AuthResponseSchema,
  type AuthCredentialsDto,
  type AuthResponseDto,
} from '@dice-arena/shared';
import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthThrottle } from '../common/throttling.js';
import { toOpenApiSchema, ZodBody } from '../common/zod/zod-body.decorator.js';
import { AuthService } from './auth.service.js';

@ApiTags('auth')
@ApiBadRequestResponse({ description: 'The username or password does not meet the format requirements.' })
@ApiTooManyRequestsResponse({ description: 'Too many attempts from this IP; retry after the Retry-After delay.' })
@AuthThrottle()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiCreatedResponse({
    description: 'Account created. Returns an access token and the new profile.',
    schema: toOpenApiSchema(AuthResponseSchema),
  })
  @ApiConflictResponse({ description: 'The username is already taken.' })
  register(@ZodBody(AuthCredentialsSchema) credentials: AuthCredentialsDto): Promise<AuthResponseDto> {
    return this.auth.register(credentials);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'Credentials accepted. Returns an access token and the profile.',
    schema: toOpenApiSchema(AuthResponseSchema),
  })
  @ApiUnauthorizedResponse({ description: 'Unknown username or wrong password.' })
  login(@ZodBody(AuthCredentialsSchema) credentials: AuthCredentialsDto): Promise<AuthResponseDto> {
    return this.auth.login(credentials);
  }
}
