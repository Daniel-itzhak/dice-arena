import type { AuthCredentialsDto, AuthResponseDto, UserDto } from '@dice-arena/shared';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service.js';
import type { AccessTokenPayload } from './authenticated-user.js';
import { PasswordService } from './password.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
  ) {}

  /** @throws ConflictException if the username is taken. */
  async register({ username, password }: AuthCredentialsDto): Promise<AuthResponseDto> {
    const user = await this.users.create(username, await this.passwords.hash(password));
    return this.startSession(user);
  }

  /** @throws UnauthorizedException with the same message for unknown usernames and wrong passwords. */
  async login({ username, password }: AuthCredentialsDto): Promise<AuthResponseDto> {
    const credentials = await this.users.findCredentials(username);
    if (!credentials || !(await this.passwords.verify(credentials.passwordHash, password))) {
      throw new UnauthorizedException('Invalid username or password');
    }
    return this.startSession(credentials.profile);
  }

  private async startSession(user: UserDto): Promise<AuthResponseDto> {
    const payload: AccessTokenPayload = { sub: user.id, username: user.username };
    return { accessToken: await this.jwt.signAsync(payload), user };
  }
}
