import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './create-patient.dto';
import { UpdatePatientDto } from './update-patient.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api/patients')
@UseGuards(JwtAuthGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  async find(
    @Query('rut') rut?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (rut) {
      const patient = await this.patientsService.findByRut(rut);
      return patient ? patient : { found: false };
    }
    if (page) {
      return this.patientsService.findPaginated(
        parseInt(page, 10) || 1,
        parseInt(limit || '20', 10) || 20,
      );
    }
    return this.patientsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.patientsService.findById(id);
  }

  @Post()
  async create(@Body() dto: CreatePatientDto) {
    return this.patientsService.create(dto);
  }

  @Post('seed')
  async seed() {
    return this.patientsService.seed();
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patientsService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.patientsService.remove(id);
  }
}
