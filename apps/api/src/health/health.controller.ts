import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOkResponse({
    description: 'The API is up and the database is reachable.',
    schema: { type: 'object', properties: { status: { type: 'string', enum: ['ok'] } } },
  })
  @ApiServiceUnavailableResponse({ description: 'The database is unreachable.' })
  async check(): Promise<{ status: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.error('Database health check failed', error);
      throw new ServiceUnavailableException('Database is unreachable');
    }
    return { status: 'ok' };
  }
}
