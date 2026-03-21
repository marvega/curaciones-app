import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WoundNotesService } from './wound-notes.service';
import { CreateWoundNoteDto } from './create-wound-note.dto';

@ApiTags('Wound Notes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wound-notes')
export class WoundNotesController {
  constructor(private readonly service: WoundNotesService) {}

  @Post()
  create(@Body() dto: CreateWoundNoteDto, @Request() req) {
    return this.service.create(dto, req.user.sub);
  }

  @Get('curacion/:curacionId')
  findByCuracion(@Param('curacionId', ParseIntPipe) curacionId: number) {
    return this.service.findByCuracion(curacionId);
  }

  @Get('patient/:patientId')
  findByPatient(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.service.findByPatient(patientId);
  }

  @Get('evolution/:patientId')
  getEvolution(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.service.getEvolutionData(patientId);
  }
}
