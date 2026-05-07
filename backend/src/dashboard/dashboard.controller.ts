import {
  Controller,
  Get,
  Query,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { MultiAuthGuard } from '../oauth/guards/multi-auth.guard';
import { OAuthScopeGuard } from '../oauth/guards/oauth-scope.guard';
import { RequiredScopes } from '../oauth/decorators/required-scopes.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(MultiAuthGuard, OAuthScopeGuard)
@Controller('api/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @RequiredScopes('agenda:read')
  @Get('today')
  @ApiOperation({
    summary: "Today's appointments with patient and curacion details",
  })
  async getTodayAppointments() {
    return this.dashboardService.getTodayAppointments();
  }

  @RequiredScopes('agenda:read')
  @Get('no-appointment')
  @ApiOperation({ summary: 'Active patients with no future appointments' })
  async getPatientsWithoutAppointment() {
    return this.dashboardService.getPatientsWithoutAppointment();
  }

  @RequiredScopes('agenda:read')
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
