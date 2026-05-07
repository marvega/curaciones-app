import { Controller, Post, Get, Body, Param, Res, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { MultiAuthGuard } from '../oauth/guards/multi-auth.guard';
import { OAuthScopeGuard } from '../oauth/guards/oauth-scope.guard';
import { RequiredScopes } from '../oauth/decorators/required-scopes.decorator';
import { ConsentService } from './consent.service';
import type { Response } from 'express';
import * as path from 'path';

@ApiTags('Consent')
@ApiBearerAuth()
@UseGuards(MultiAuthGuard, OAuthScopeGuard)
@Controller('api/consent')
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  @RequiredScopes('clinical:write')
  @Post()
  @ApiOperation({ summary: 'Save a patient consent signature' })
  async saveSignature(
    @Body() body: { patientId: number; signature: string; consentText?: string },
    @CurrentUser() user: any,
  ) {
    return this.consentService.saveSignature(
      body.patientId,
      user.id,
      body.signature,
      body.consentText,
    );
  }

  @RequiredScopes('clinical:read')
  @Get('patient/:patientId')
  @ApiOperation({ summary: 'Get consent signatures for a patient' })
  async findByPatient(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.consentService.findByPatient(patientId);
  }

  @RequiredScopes('clinical:read')
  @Get('file/:filename')
  @ApiOperation({ summary: 'Serve a signature image file' })
  async serveFile(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = path.join(this.consentService.getSignaturesDir(), filename);
    return res.sendFile(filePath);
  }
}
