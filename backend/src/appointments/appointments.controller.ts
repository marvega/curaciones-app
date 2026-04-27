import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './create-appointment.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Appointments')
@ApiBearerAuth()
@Controller('api/appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  async create(@Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.create(dto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.appointmentsService.remove(id);
  }

  @Get('patient/:patientId')
  async findByPatient(
    @Param('patientId', ParseIntPipe) patientId: number,
  ) {
    return this.appointmentsService.findByPatient(patientId);
  }
}
