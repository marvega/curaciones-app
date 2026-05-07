import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MultiAuthGuard } from '../oauth/guards/multi-auth.guard';
import { OAuthScopeGuard } from '../oauth/guards/oauth-scope.guard';
import { RequiredScopes } from '../oauth/decorators/required-scopes.decorator';
import { WoundNotesService } from './wound-notes.service';
import { CreateWoundNoteDto } from './create-wound-note.dto';

@ApiTags('Wound Notes')
@ApiBearerAuth()
@UseGuards(MultiAuthGuard, OAuthScopeGuard)
@Controller('api/wound-notes')
export class WoundNotesController {
  constructor(private readonly service: WoundNotesService) {}

  /**
   * Parse the ?limit= query param for the cursor branch with safe bounds.
   * Mirrors PatientsController.parseLimit — fallback 20, cap 100.
   */
  private parseLimit(raw: string | undefined): number {
    const n = parseInt(raw || '20', 10);
    if (!Number.isFinite(n) || n <= 0) return 20;
    return Math.min(n, 100);
  }

  @RequiredScopes('clinical:write')
  @Post()
  create(@Body() dto: CreateWoundNoteDto, @Request() req) {
    return this.service.create(dto, req.user.sub);
  }

  @RequiredScopes('clinical:read')
  @Get('curacion/:curacionId')
  findByCuracion(@Param('curacionId', ParseIntPipe) curacionId: number) {
    return this.service.findByCuracion(curacionId);
  }

  @RequiredScopes('clinical:read')
  @Get('patient/:patientId')
  async findByPatient(
    @Param('patientId', ParseIntPipe) patientId: number,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    if (cursor !== undefined) {
      try {
        return await this.service.findByPatientCursor({
          patientId,
          limit: this.parseLimit(limit),
          cursor: cursor || undefined,
        });
      } catch (e) {
        if ((e as Error).message?.toLowerCase().includes('invalid cursor')) {
          throw new BadRequestException('invalid cursor');
        }
        throw e;
      }
    }
    return this.service.findByPatient(patientId);
  }

  @RequiredScopes('clinical:read')
  @Get('evolution/:patientId')
  getEvolution(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.service.getEvolutionData(patientId);
  }
}
