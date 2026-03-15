import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsDateString,
} from 'class-validator';
import { CuracionType } from './curacion.entity';

export class CreateCuracionDto {
  @IsNumber()
  patientId: number;

  @IsEnum(CuracionType)
  type: CuracionType;

  @IsDateString()
  date: string;

  // Legacy fields — kept for Phase 1 dual-write
  @IsDateString()
  @IsOptional()
  nextAppointmentDate?: string;

  @IsString()
  @IsOptional()
  nextAppointmentTime?: string;

  // New fields — used to create linked Appointment
  @IsDateString()
  @IsOptional()
  appointmentDate?: string;

  @IsString()
  @IsOptional()
  appointmentTime?: string;

  @IsNumber()
  @IsOptional()
  quantity?: number;

  @IsString()
  @IsOptional()
  observations?: string;
}
