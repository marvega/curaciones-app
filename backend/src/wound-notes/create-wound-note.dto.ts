import {
  IsInt,
  IsOptional,
  IsNumber,
  IsEnum,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WoundColor, ExudateLevel, HealingStage } from './wound-note.entity';

export class CreateWoundNoteDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  curacionId: number;

  @ApiPropertyOptional({ example: 3.5, description: 'Wound width in cm' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  woundWidth?: number;

  @ApiPropertyOptional({ example: 4.2, description: 'Wound length in cm' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  woundLength?: number;

  @ApiPropertyOptional({ enum: WoundColor, example: 'red' })
  @IsOptional()
  @IsEnum(WoundColor)
  woundColor?: WoundColor;

  @ApiPropertyOptional({ enum: ExudateLevel, example: 'low' })
  @IsOptional()
  @IsEnum(ExudateLevel)
  exudateLevel?: ExudateLevel;

  @ApiPropertyOptional({ enum: HealingStage, example: 'proliferative' })
  @IsOptional()
  @IsEnum(HealingStage)
  healingStage?: HealingStage;

  @ApiPropertyOptional({
    example: 'Wound edges are clean, granulation tissue visible',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
