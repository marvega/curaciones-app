import { IsEnum, IsNumber, IsOptional, IsString, IsDateString, IsNotEmpty } from 'class-validator';
import { CuracionType } from './curacion.entity';

export class UpdateCuracionDto {
  @IsEnum(CuracionType)
  @IsOptional()
  type?: CuracionType;

  @IsNumber()
  @IsOptional()
  quantity?: number;

  @IsDateString()
  @IsOptional()
  appointmentDate?: string;

  @IsString()
  @IsOptional()
  appointmentTime?: string;

  @IsString()
  @IsNotEmpty({ message: 'El motivo de la edición es obligatorio' })
  reason: string;
}
