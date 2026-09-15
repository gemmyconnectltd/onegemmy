class AuthUser {
  final String id;
  final String email;
  final String fullName;
  final String role;
  final bool isSuperuser;
  final String? tenantId;
  final String? tenantName;
  final String? tenantSlug;

  AuthUser({
    required this.id,
    required this.email,
    required this.fullName,
    required this.role,
    required this.isSuperuser,
    this.tenantId,
    this.tenantName,
    this.tenantSlug,
  });

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    return AuthUser(
      id: json['id'] as String,
      email: json['email'] as String,
      fullName: json['full_name'] as String? ?? '',
      role: json['role'] as String? ?? 'member',
      isSuperuser: json['is_superuser'] as bool? ?? false,
      tenantId: json['tenant_id'] as String?,
      tenantName: json['tenant_name'] as String?,
      tenantSlug: json['tenant_slug'] as String?,
    );
  }
}

class AuthTokens {
  final String accessToken;
  final String refreshToken;
  final AuthUser user;

  AuthTokens({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
  });

  factory AuthTokens.fromJson(Map<String, dynamic> json) {
    return AuthTokens(
      accessToken: json['access_token'] as String,
      refreshToken: json['refresh_token'] as String,
      user: AuthUser.fromJson(json['user'] as Map<String, dynamic>),
    );
  }
}
