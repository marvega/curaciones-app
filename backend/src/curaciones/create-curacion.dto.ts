import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CuracionType } from './curacion.entity';

export class CreateCuracionDto {
  @ApiProperty({ example: 1 })
  @IsNumber()
  patientId: number;

  @ApiProperty({ example: 'avanzada', enum: CuracionType })
  @IsEnum(CuracionType)
  type: CuracionType;

  @ApiProperty({ example: '2026-03-20' })
  @IsDateString()
  date: string;

  // Fields used to create linked Appointment
  @ApiPropertyOptional({ example: '2026-04-01' })
  @IsDateString()
  @IsOptional()
  appointmentDate?: string;

  @ApiPropertyOptional({ example: '13:00' })
  @IsString()
  @IsOptional()
  appointmentTime?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsNumber()
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional({ example: 'Healing well' })
  @IsString()
  @IsOptional()
  observations?: string;

  @ApiPropertyOptional({ example: false, description: 'Boot (ayuda técnica de descarga) delivered — only meaningful for pie_diabetico' })
  @IsBoolean()
  @IsOptional()
  bootDelivered?: boolean;
}
