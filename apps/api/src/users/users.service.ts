import { LEADERBOARD_SIZE, type LeaderboardEntryDto, type UserDto } from '@dice-arena/shared';
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toLeaderboardEntry, toUserDto } from './users.mappers.js';

const PROFILE_SELECT = { id: true, username: true, wins: true, isAi: true } satisfies Prisma.UserSelect;
const LEADERBOARD_SELECT = { id: true, username: true, wins: true, gamesPlayed: true } satisfies Prisma.UserSelect;

/** Prisma error code for a unique constraint violation. */
const UNIQUE_CONSTRAINT_FAILED = 'P2002';

export interface UserCredentials {
  profile: UserDto;
  passwordHash: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** @throws ConflictException if the username is taken, including by the AI player. */
  async create(username: string, passwordHash: string): Promise<UserDto> {
    try {
      const user = await this.prisma.user.create({ data: { username, passwordHash }, select: PROFILE_SELECT });
      return toUserDto(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_FAILED) {
        throw new ConflictException('Username is already taken');
      }
      throw error;
    }
  }

  /** The only lookup that loads `passwordHash`; it is kept apart from the profile so it cannot be returned by accident. */
  async findCredentials(username: string): Promise<UserCredentials | null> {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { ...PROFILE_SELECT, passwordHash: true },
    });
    return user && { profile: toUserDto(user), passwordHash: user.passwordHash };
  }

  /**
   * Top human players by wins. The AI opponent is excluded because it plays every vs-AI game and
   * would otherwise hold first place permanently.
   */
  async getLeaderboard(): Promise<LeaderboardEntryDto[]> {
    const players = await this.prisma.user.findMany({
      where: { isAi: false },
      // Equal wins in fewer games is the better record; username makes the order deterministic.
      orderBy: [{ wins: 'desc' }, { gamesPlayed: 'asc' }, { username: 'asc' }],
      take: LEADERBOARD_SIZE,
      select: LEADERBOARD_SELECT,
    });
    return players.map(toLeaderboardEntry);
  }
}
