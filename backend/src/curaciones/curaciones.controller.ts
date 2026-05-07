import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Query,
  Param,
  ParseIntPipe,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { CuracionesService } from './curaciones.service';
import { CreateCuracionDto } from './create-curacion.dto';
import { UpdateCuracionDto } from './update-curacion.dto';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { MultiAuthGuard } from '../oauth/guards/multi-auth.guard';
import { OAuthScopeGuard } from '../oauth/guards/oauth-scope.guard';
import { RequiredScopes } from '../oauth/decorators/required-scopes.decorator';

@ApiTags('Curaciones')
@ApiBearerAuth()
@Controller('api/curaciones')
@UseGuards(MultiAuthGuard, OAuthScopeGuard)
export class CuracionesController {
  constructor(private readonly curacionesService: CuracionesService) {}

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
  async create(@Body() dto: CreateCuracionDto) {
    return this.curacionesService.create(dto);
  }

  @RequiredScopes('clinical:read')
  @Get('patient/:patientId')
  async findByPatient(
    @Param('patientId', ParseIntPipe) patientId: number,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    // Cursor branch: when ?cursor= is present (even empty) the client opts
    // into the cursor-paginated contract. Bad opaque cursor → 400.
    if (cursor !== undefined) {
      try {
        return await this.curacionesService.findByPatientCursor({
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
    return this.curacionesService.findByPatient(patientId);
  }

  @RequiredScopes('clinical:read')
  @Get('agenda')
  async getAgenda(@Query('from') from: string, @Query('to') to: string) {
    return this.curacionesService.getAgenda(from, to);
  }

  @RequiredScopes('clinical:read')
  @Get('availability')
  async getAvailability(@Query('date') date: string) {
    return this.curacionesService.getAvailability(date);
  }

  @RequiredScopes('clinical:write')
  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCuracionDto,
    @Req() req: Request,
  ) {
    const user = req.user as { id: number };
    return this.curacionesService.update(id, dto, user.id);
  }

  @RequiredScopes('clinical:read')
  @Get(':id/edits')
  async getEdits(@Param('id', ParseIntPipe) id: number) {
    return this.curacionesService.getEdits(id);
  }
}
