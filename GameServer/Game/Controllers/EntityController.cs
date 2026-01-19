using System.Numerics;
using Server.Game.Models;
using Server.Game.Models.DTOs;
using Server.Game.Services;
using Server.Game.Services.Entities;

namespace Server.Game.Controllers;

/// <summary>
/// Controller responsible for entity-related operations including movement, building placement, and entity management
/// </summary>
public sealed class EntityController(EntityManager entityManager, SessionManager sessionManager)
{

    public (bool ok, string? error) TryPlaceBuilding(int accountId, EEntityType entityType, int tx, int ty)
    {        
        var result = entityManager.TryPlaceBuilding(accountId, entityType, tx, ty);

        // Update session activity on success
        if (result.ok) sessionManager.UpdateActivity(accountId);

        return result;
    }

    public (bool ok, string? error) TryEnqueueMove(int accountId, string unitId, int tx, int ty)
    {
        var result = entityManager.TryEnqueueMove(accountId, unitId, tx, ty);

        if (result.ok) sessionManager.UpdateActivity(accountId);

        return result;
    }

    public (bool ok, string? error) TrySetTarget(int accountId, string unitId, string targetUnitId)
    {
        var result = entityManager.TrySetTarget(accountId, unitId, targetUnitId);
        
        if(result.ok) sessionManager.UpdateActivity(accountId);

        return result;
    }

    public (bool ok, string? error) TryEnqueueTraining(int accountId, string buildingId, EEntityType unitType)
    {
        var result = entityManager.TryEnqueueTraining(accountId, buildingId, unitType);
        
        if (result.ok) sessionManager.UpdateActivity(accountId);
        
        return result;
    }

    public (bool ok, string? error) TryCancelTraining(int accountId, string buildingId, int setIndex)
    {
        var result = entityManager.TryCancelTraining(accountId, buildingId, setIndex);

        if (result.ok) sessionManager.UpdateActivity(accountId);

        return result;
    }
    
    
}
