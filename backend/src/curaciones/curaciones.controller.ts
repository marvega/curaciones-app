import { Controller, Get, Post, Body, Query, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { CuracionesService } from './curaciones.service';
import { CreateCuracionDto } from './create-curacion.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

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
}
