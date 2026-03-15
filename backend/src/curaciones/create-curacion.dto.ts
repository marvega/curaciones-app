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

  // Fields used to create linked Appointment
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
