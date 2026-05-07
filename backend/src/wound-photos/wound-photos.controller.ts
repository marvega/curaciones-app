import {
  Controller, Get, Post, Delete, Param, Body,
  UseGuards, UseInterceptors, UploadedFile, ParseIntPipe, Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { MultiAuthGuard } from '../oauth/guards/multi-auth.guard';
import { OAuthScopeGuard } from '../oauth/guards/oauth-scope.guard';
import { RequiredScopes } from '../oauth/decorators/required-scopes.decorator';
import { WoundPhotosService } from './wound-photos.service';
import type { Response } from 'express';
import * as path from 'path';

@ApiTags('Wound Photos')
@ApiBearerAuth()
@UseGuards(MultiAuthGuard, OAuthScopeGuard)
@Controller('api/wound-photos')
export class WoundPhotosController {
  constructor(private readonly photosService: WoundPhotosService) {}

  @RequiredScopes('clinical:write')
  @Post()
  @ApiOperation({ summary: 'Upload a wound photo' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = path.join(process.cwd(), 'uploads', 'photos');
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `wound-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          cb(new Error('Only image files are allowed'), false);
        } else {
          cb(null, true);
        }
      },
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('patientId', ParseIntPipe) patientId: number,
    @Body('photoDate') photoDate: string,
    @Body('description') description: string,
    @CurrentUser() user: any,
  ) {
    return this.photosService.create(patientId, user.id, file, photoDate, description);
  }

  @RequiredScopes('clinical:read')
  @Get('patient/:patientId')
  @ApiOperation({ summary: 'Get wound photos for a patient' })
  async findByPatient(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.photosService.findByPatient(patientId);
  }

  @RequiredScopes('clinical:read')
  @Get('file/:filename')
  @ApiOperation({ summary: 'Serve a wound photo file' })
  async serveFile(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = path.join(this.photosService.getUploadDir(), filename);
    return res.sendFile(filePath);
  }

  @RequiredScopes('clinical:write')
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a wound photo' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.photosService.remove(id);
    return { deleted: true };
  }
}
