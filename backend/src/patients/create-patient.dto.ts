import { IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePatientDto {
  @ApiProperty({ example: '11111111-1' })
  @IsString()
  @IsNotEmpty()
  rut: string;

  @ApiProperty({ example: 'Ana' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Gonzalez' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: '1985-03-15' })
  @IsDateString()
  birthDate: string;

  @ApiProperty({ example: 'Femenino' })
  @IsString()
  @IsNotEmpty()
  gender: string;

  @ApiPropertyOptional({ example: '+56912345678' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'Av. Principal 123' })
  @IsString()
  @IsOptional()
  address?: string;
}
