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
import { MultiAuthGuard } from '../oauth/guards/multi-auth.guard';
import { OAuthScopeGuard } from '../oauth/guards/oauth-scope.guard';
import { RequiredScopes } from '../oauth/decorators/required-scopes.decorator';
import { WoundNotesService } from './wound-notes.service';
import { CreateWoundNoteDto } from './create-wound-note.dto';

@ApiTags('Wound Notes')
@ApiBearerAuth()
@UseGuards(MultiAuthGuard, OAuthScopeGuard)
@Controller('api/wound-notes')
export class WoundNotesController {
  constructor(private readonly service: WoundNotesService) {}

  @RequiredScopes('clinical:write')
  @Post()
  create(@Body() dto: CreateWoundNoteDto, @Request() req) {
    return this.service.create(dto, req.user.sub);
  }

  @RequiredScopes('clinical:read')
  @Get('curacion/:curacionId')
  findByCuracion(@Param('curacionId', ParseIntPipe) curacionId: number) {
    return this.service.findByCuracion(curacionId);
  }

  @RequiredScopes('clinical:read')
  @Get('patient/:patientId')
  findByPatient(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.service.findByPatient(patientId);
  }

  @RequiredScopes('clinical:read')
  @Get('evolution/:patientId')
  getEvolution(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.service.getEvolutionData(patientId);
  }
}
