
namespace Server.Models;

public class User
{
    public int Id { get; set; }
    public string GoogleId { get; init; } = string.Empty;
    public string Email { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;

    public UserData? Data { get; init; }
}

public class UserData
{
    public int Id { get; init; }
    public int UserId { get; init; }
    public User User { get; init; } = null!;

    public int Gems { get; set; } = 0;

    public string UnlockedCivilizations { get; set; } = "[]";
    public DateTime LastLogin { get; init; } = DateTime.UtcNow;
}