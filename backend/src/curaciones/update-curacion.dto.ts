import { IsEnum, IsNumber, IsOptional, IsString, IsDateString, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CuracionType } from './curacion.entity';

export class UpdateCuracionDto {
  @ApiPropertyOptional({ example: 'avanzada', enum: CuracionType })
  @IsEnum(CuracionType)
  @IsOptional()
  type?: CuracionType;

  @ApiPropertyOptional({ example: 1 })
  @IsNumber()
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional({ example: '2026-04-01' })
  @IsDateString()
  @IsOptional()
  appointmentDate?: string;

  @ApiPropertyOptional({ example: '13:00' })
  @IsString()
  @IsOptional()
  appointmentTime?: string;

  @ApiProperty({ example: 'Correction' })
  @IsString()
  @IsNotEmpty({ message: 'El motivo de la edicion es obligatorio' })
  reason: string;
}
