import {
  Controller,
  Get,
  Query,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('today')
  @ApiOperation({
    summary: "Today's appointments with patient and curacion details",
  })
  async getTodayAppointments() {
    return this.dashboardService.getTodayAppointments();
  }

  @Get('no-appointment')
  @ApiOperation({ summary: 'Active patients with no future appointments' })
  async getPatientsWithoutAppointment() {
    return this.dashboardService.getPatientsWithoutAppointment();
  }

  @Get('inactive')
  @ApiOperation({
    summary: 'Active patients whose last curacion exceeds threshold',
  })
  @ApiQuery({ name: 'days', required: true, type: Number, example: 14 })
  async getInactivePatients(@Query('days', ParseIntPipe) days: number) {
    if (days < 1) {
      throw new BadRequestException('days must be >= 1');
    }
    return this.dashboardService.getInactivePatients(days);
  }
}
