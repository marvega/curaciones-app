import { Controller, Get, Post, Put, Body, Query, Param, ParseIntPipe, UseGuards, Req } from '@nestjs/common';
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

  @RequiredScopes('clinical:write')
  @Post()
  async create(@Body() dto: CreateCuracionDto) {
    return this.curacionesService.create(dto);
  }

  @RequiredScopes('clinical:read')
  @Get('patient/:patientId')
  async findByPatient(@Param('patientId', ParseIntPipe) patientId: number) {
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
  @UseGuards(MultiAuthGuard, OAuthScopeGuard, RolesGuard)
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
