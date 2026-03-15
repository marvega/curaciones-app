import { Controller, Get, Post, Put, Body, Query, Param, ParseIntPipe, UseGuards, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CuracionesService } from './curaciones.service';
import { CreateCuracionDto } from './create-curacion.dto';
import { UpdateCuracionDto } from './update-curacion.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('api/curaciones')
@UseGuards(JwtAuthGuard)
export class CuracionesController {
  constructor(private readonly curacionesService: CuracionesService) {}

  @Post()
  async create(@Body() dto: CreateCuracionDto) {
    return this.curacionesService.create(dto);
  }

  @Get('patient/:patientId')
  async findByPatient(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.curacionesService.findByPatient(patientId);
  }

  @Get('agenda')
  async getAgenda(@Query('from') from: string, @Query('to') to: string) {
    return this.curacionesService.getAgenda(from, to);
  }

  @Get('availability')
  async getAvailability(@Query('date') date: string) {
    return this.curacionesService.getAvailability(date);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCuracionDto,
    @Req() req: Request,
  ) {
    const user = req.user as { id: number };
    return this.curacionesService.update(id, dto, user.id);
  }

  @Get(':id/edits')
  async getEdits(@Param('id', ParseIntPipe) id: number) {
    return this.curacionesService.getEdits(id);
  }
}
