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
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { PatientsService } from './patients.service';
import { PatientPdfService } from './patient-pdf.service';
import { CreatePatientDto } from './create-patient.dto';
import { UpdatePatientDto } from './update-patient.dto';
import { Throttle } from '@nestjs/throttler';
import { MultiAuthGuard } from '../oauth/guards/multi-auth.guard';
import { OAuthScopeGuard } from '../oauth/guards/oauth-scope.guard';
import { RequiredScopes } from '../oauth/decorators/required-scopes.decorator';

@ApiTags('Patients')
@ApiBearerAuth()
@Controller('api/patients')
@UseGuards(MultiAuthGuard, OAuthScopeGuard)
export class PatientsController {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly patientPdfService: PatientPdfService,
  ) {}

  @Throttle({ default: { ttl: 60000, limit: 300 } })
  @RequiredScopes('patients:read')
  @Get()
  async find(
    @Query('rut') rut?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('gender') gender?: string,
    @Query('curacionType') curacionType?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('ageMin') ageMin?: string,
    @Query('ageMax') ageMax?: string,
  ) {
    if (rut) {
      const patient = await this.patientsService.findByRut(rut);
      return patient ? patient : { found: false };
    }

    const trimmedQ = q?.trim();
    const hasQ = !!trimmedQ;
    const hasAdvancedFilters = status || gender || curacionType || dateFrom || dateTo || ageMin || ageMax;

    if (hasQ || hasAdvancedFilters) {
      return this.patientsService.findAdvanced({
        page: parseInt(page || '1', 10) || 1,
        limit: parseInt(limit || '20', 10) || 20,
        status: status || undefined,
        gender: gender || undefined,
        curacionType: curacionType || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        ageMin: ageMin ? parseInt(ageMin, 10) : undefined,
        ageMax: ageMax ? parseInt(ageMax, 10) : undefined,
        q: trimmedQ || undefined,
      });
    }

    if (page) {
      return this.patientsService.findPaginated(
        parseInt(page, 10) || 1,
        parseInt(limit || '20', 10) || 20,
      );
    }
    return this.patientsService.findAll();
  }

  @Throttle({ default: { ttl: 60000, limit: 300 } })
  @RequiredScopes('patients:read')
  @Get(':id/pdf')
  @ApiOperation({ summary: 'Download patient clinical record as PDF' })
  async downloadPdf(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const buffer = await this.patientPdfService.generatePdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="ficha-paciente-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Throttle({ default: { ttl: 60000, limit: 300 } })
  @RequiredScopes('patients:read')
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.patientsService.findById(id);
  }

  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @RequiredScopes('patients:write')
  @Post()
  async create(@Body() dto: CreatePatientDto) {
    return this.patientsService.create(dto);
  }

  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @RequiredScopes('patients:write')
  @Post('seed')
  async seed() {
    return this.patientsService.seed();
  }

  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @RequiredScopes('patients:write')
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patientsService.update(id, dto);
  }

  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @RequiredScopes('patients:write')
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.patientsService.remove(id);
  }

  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @RequiredScopes('patients:write')
  @Post(':id/discharge')
  async discharge(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { cancelAppointment?: boolean },
    @Req() req: Request,
  ) {
    const user = req.user as { id: number };
    return this.patientsService.discharge(id, user.id, body.cancelAppointment || false);
  }

  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @RequiredScopes('patients:write')
  @Post(':id/readmit')
  async readmit(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    const user = req.user as { id: number };
    return this.patientsService.readmit(id, user.id);
  }

  @Throttle({ default: { ttl: 60000, limit: 300 } })
  @RequiredScopes('patients:read')
  @Get(':id/status-history')
  async getStatusHistory(@Param('id', ParseIntPipe) id: number) {
    return this.patientsService.getStatusHistory(id);
  }
}
