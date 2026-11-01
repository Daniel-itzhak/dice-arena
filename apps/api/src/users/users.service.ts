import { AI_PLAYER_USERNAME, LEADERBOARD_SIZE, type LeaderboardEntryDto, type UserDto } from '@dice-arena/shared';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
   * Public profile of the built-in AI opponent, so clients can name it as `player2Id` in a vs-AI game.
   * @throws NotFoundException if the AI account is missing or has been turned into a human account.
   */
  async getAiPlayer(): Promise<UserDto> {
    const ai = await this.prisma.user.findFirst({
      where: { username: AI_PLAYER_USERNAME, isAi: true },
      select: PROFILE_SELECT,
    });
    if (!ai) {
      throw new NotFoundException('The AI player is not available');
    }
    return toUserDto(ai);
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
