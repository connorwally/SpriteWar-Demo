using Server.Game.Models.DTOs;
using Server.Game.Services;

namespace Server.Game.Models;

public record EntityConfig(
    EEntityType id,
    EEntityCategory category,
    int baseHp,
    UnitStats? unit,
    BuildingStats? building,
    Resources? resource,
    Size? size
);
public record Size(int w, int h);

public record Training(EEntityType building, Resources cost);

public record UnitStats(
    float? moveSpeed,
    int? attackRange,
    int? attackDamage,
    List<EEntityCategory>? attackableTypes,
    EEntityType? trainedAt,
    Resources? cost,
    int? trainingTime,
    int? viewRange
);

public record BuildingStats(
    int? attackDamage,
    int? attackRange,
    List<EEntityCategory>? attackableTypes,
    int? popProvided,
    Resources? cost,
    int? viewRange
);

public record CleanEntityConfig(
	EEntityType id,
	EEntityCategory category,
	int baseHp,
	CleanUnitStats unit,
	CleanBuildingStats building,
	Resources resource,
	Size size
);

public record CleanUnitStats(
	float moveSpeed,
	int attackRange,
	int attackDamage,
	List<EEntityCategory> attackableTypes,
	EEntityType? trainedAt,
	Resources cost,
	int trainingTime,
	int viewRange
);

public record CleanBuildingStats(
	int attackDamage,
	int attackRange,
	List<EEntityCategory> attackableTypes,
	int popProvided,
	Resources cost,
	int viewRange
);

public static class EntityConfigCleaner
{
	public static CleanEntityConfig Clean(EntityConfig e)
	{
		// Size defaults
		var size = e.size ?? new Size(1, 1);

		// BaseHP default
		var baseHp = e.baseHp <= 0 ? 1 : e.baseHp;

		// Unit defaults (produce a non-null struct even if original was null)
		var u = e.unit;
		var unit = new CleanUnitStats(
			moveSpeed: u?.moveSpeed is null or < 0 ? 0 : u.moveSpeed.Value,
			attackRange: u?.attackRange is null or < 0 ? 0 : u.attackRange.Value,
			attackDamage: u?.attackDamage is null or < 0 ? 0 : u.attackDamage.Value,
			attackableTypes: u?.attackableTypes is { Count: > 0 } ? [..u.attackableTypes] : [],
			trainedAt: u?.trainedAt,
			cost: u?.cost ?? new Resources(0,0,0,0),
			trainingTime: u?.trainingTime is null or < 0 ? 0 : u.trainingTime.Value,
			viewRange: u?.viewRange ?? 8 
		);

		// Building defaults (produce a non-null struct even if original was null)
		var b = e.building;
		var building = new CleanBuildingStats(
			attackDamage: b?.attackDamage is null or < 0 ? 0 : b.attackDamage.Value,
			attackRange: b?.attackRange is null or < 0 ? 0 : b.attackRange.Value,
			attackableTypes: b?.attackableTypes is { Count: > 0 } ? [..b.attackableTypes] : [],
			popProvided: b?.popProvided is null or < 0 ? 0 : b.popProvided.Value,
			cost: b?.cost ?? new Resources(0, 0, 0, 0),
			viewRange: b?.viewRange ?? 8
		);

		// Resource defaults
		var resource = e.resource ?? new Resources(0, 0, 0, 0);

		return new CleanEntityConfig(
			id: e.id,
			category: e.category,
			baseHp: baseHp,
			unit: unit,
			building: building,
			resource: resource,
			size: size
		);
	}

	public static CleanEntityConfig ToCleaned(this EntityConfig e) => Clean(e);
}