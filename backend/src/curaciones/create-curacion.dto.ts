import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsDateString,
  Matches,
} from 'class-validator';
import { CuracionType } from './curacion.entity';

export class CreateCuracionDto {
  @IsNumber()
  patientId: number;

  @IsEnum(CuracionType)
  type: CuracionType;

  @IsDateString()
  date: string;

  @IsDateString()
  @IsOptional()
  nextAppointmentDate?: string;

  @IsString()
  @IsOptional()
  @Matches(/^(12:30|13:00|13:30|14:00|14:30|15:00|15:30|16:00)$/, {
    message:
      'La hora debe ser un bloque de 30 minutos entre 12:30 y 16:00',
  })
  nextAppointmentTime?: string;

  @IsNumber()
  @IsOptional()
  quantity?: number;

  @IsString()
  @IsOptional()
  observations?: string;
}
