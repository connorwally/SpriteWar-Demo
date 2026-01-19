using Microsoft.AspNetCore.RateLimiting;
using Server.Services;
using Microsoft.AspNetCore.WebSockets;

// Load .env file from global secrets
// Load .env file from global secrets
var environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Development";

// Get the solution root directory (go up from Server to the root)
var currentDirectory = Directory.GetCurrentDirectory();
var solutionRoot = Path.GetFullPath(Path.Combine(currentDirectory, ".."));
var envFile = Path.Combine(solutionRoot, "secrets", "server.env");

if (File.Exists(envFile))
{
    foreach (var line in File.ReadAllLines(envFile))
    {
        if (string.IsNullOrWhiteSpace(line) || line.StartsWith("#"))
            continue;

        var parts = line.Split('=', 2);
        if (parts.Length == 2)
        {
            Environment.SetEnvironmentVariable(parts[0].Trim(), parts[1].Trim());
        }
    }

    Console.WriteLine($"Loaded environment variables from {envFile}");
}
else
{
    Console.WriteLine("Failed to find environment file.");
}

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("RefreshTokenPolicy", opt =>
    {
        opt.PermitLimit = 5; // 5 requests
        opt.Window = TimeSpan.FromMinutes(10); // per 10 minutes
        opt.QueueProcessingOrder = System.Threading.RateLimiting.QueueProcessingOrder.OldestFirst;
        opt.QueueLimit = 2;
    });
    options.AddFixedWindowLimiter("GoogleCallbackPolicy", opt =>
    {
        opt.PermitLimit = 10; // 10 attempts
        opt.Window = TimeSpan.FromMinutes(5); // per 5 minutes
        opt.QueueProcessingOrder = System.Threading.RateLimiting.QueueProcessingOrder.OldestFirst;
        opt.QueueLimit = 3;
    });
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowClient", policy =>
    {
        policy.WithOrigins("http://localhost:5173", "https://localhost:5173")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

builder.Services.AddMemoryCache();

builder.Services.AddControllers();
builder.Services.AddScoped<GameServerProxyService>();

// Add WebSocket support
builder.Services.AddWebSockets(options => { options.KeepAliveInterval = TimeSpan.FromSeconds(20); });

var app = builder.Build();

// Configure pipeline
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection(); // Only on prod/behind reverse proxy
}
app.UseStaticFiles(); // For serving Client
app.UseRouting();
app.UseRateLimiter();

app.Use(async (context, next) =>
{
    context.Response.Headers.Append("X-Content-Type-Options", "nosniff");
    context.Response.Headers.Append("X-Frame-Options", "DENY");
    context.Response.Headers.Append("X-XSS-Protection", "1; mode=block");
    await next();
});

app.UseCors("AllowClient");


// WebSocket proxy endpoint
app.UseWebSockets();
app.Map("/ws", async context =>
{
    var origin = context.Request.Headers.Origin.ToString();
    var allowed = origin is "" or "http://localhost:5173" or "https://localhost:5173";
    if (!allowed)
    {
        context.Response.StatusCode = 403;
        await context.Response.WriteAsync("Origin now allowed.")
        return;
    }
    
    if (!context.WebSockets.IsWebSocketRequest)
    {
        context.Response.StatusCode = 400;
        await context.Response.WriteAsync("WebSocket requests only.");
        return;
    }

    using var ws = await context.WebSockets.AcceptWebSocketAsync();
    var proxyService = context.RequestServices.GetRequiredService<GameServerProxyService>();
    await proxyService.ProxyWebSocketAsync(ws, context.RequestAborted);
});

app.MapControllers();

// Serve Client for all non-API routes
app.MapFallbackToFile("index.html");

app.Run();