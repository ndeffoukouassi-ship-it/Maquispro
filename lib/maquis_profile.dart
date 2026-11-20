class MaquisProfile {
  const MaquisProfile({
    required this.name,
    required this.ownerName,
    required this.phone,
    required this.city,
    required this.address,
    required this.managerName,
    required this.configuredAt,
  });

  final String name;
  final String ownerName;
  final String phone;
  final String city;
  final String address;
  final String managerName;
  final DateTime configuredAt;

  /// Local demo setup != commercial licence activation.
  String get licenceStatus => 'Non activée (démonstration)';
  DateTime? get licenceActivatedAt => null;

  factory MaquisProfile.fromMap(Map<String, Object?> m) => MaquisProfile(
    name: m['nom'] as String,
    ownerName: m['proprietaire'] as String,
    phone: m['telephone'] as String,
    city: m['ville'] as String,
    address: m['adresse'] as String,
    managerName: m['gerant'] as String,
    configuredAt: DateTime.fromMillisecondsSinceEpoch(m['configure_le_ms'] as int),
  );
}

class MaquisProfileDraft {
  const MaquisProfileDraft({
    required this.name,
    required this.ownerName,
    required this.phone,
    required this.city,
    required this.address,
    required this.managerName,
  });

  final String name;
  final String ownerName;
  final String phone;
  final String city;
  final String address;
  final String managerName;

  bool get isValid => name.trim().isNotEmpty &&
    ownerName.trim().isNotEmpty &&
    phone.trim().isNotEmpty &&
    city.trim().isNotEmpty;
}
