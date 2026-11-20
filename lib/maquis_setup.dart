import 'package:flutter/material.dart';
import 'maquis_profile.dart';

const _vert = Color(0xFF08623F);
const _bleu = Color(0xFFE4F3FF);
const _or = Color(0xFFD4AF37);

/// Vraie image photoréaliste de bouteille de champagne (sans marque),
/// embarquée dans l'APK pour fonctionner sans connexion Internet.
class ChampagneBackground extends StatelessWidget {
  const ChampagneBackground({
    super.key,
    this.title = 'MaquisPro',
    this.subtitle = 'Gestion intelligente des boissons',
  });

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) => Container(
    height: 218,
    clipBehavior: Clip.antiAlias,
    decoration: BoxDecoration(
      color: _bleu,
      border: Border.all(color: _or, width: 1.5),
      borderRadius: const BorderRadius.all(Radius.circular(22)),
    ),
    child: Stack(children: [
      Positioned(
        right: 7,
        top: -9,
        bottom: -10,
        width: 164,
        child: Image.asset(
          'assets/images/champagne_maquispro.jpg',
          fit: BoxFit.contain,
          errorBuilder: (context, error, stack) =>
              const Center(child: Icon(Icons.wine_bar, color: _or, size: 84)),
        ),
      ),
      Positioned(
        top: 36, left: 20, right: 121,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: _vert, fontSize: 27, fontWeight: FontWeight.w900)),
            const SizedBox(height: 8),
            Text(subtitle,
              style: const TextStyle(color: _vert, fontSize: 14)),
            const SizedBox(height: 18),
            const Text(
              'IGC • Impact Global Consulting',
              style: TextStyle(
                color: Color(0xFF876819),
                fontSize: 11, fontWeight: FontWeight.w800),
            ),
          ],
        ),
      ),
    ]),
  );
}

class MaquisSetupPage extends StatefulWidget {
  const MaquisSetupPage({super.key, this.initialProfile, required this.onSave});
  final MaquisProfile? initialProfile;
  final Future<void> Function(MaquisProfileDraft draft) onSave;

  @override
  State<MaquisSetupPage> createState() => _MaquisSetupPageState();
}

class _MaquisSetupPageState extends State<MaquisSetupPage> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _owner;
  late final TextEditingController _manager;
  late final TextEditingController _phone;
  late final TextEditingController _city;
  late final TextEditingController _address;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final p = widget.initialProfile;
    _name = TextEditingController(text: p?.name ?? '');
    _owner = TextEditingController(text: p?.ownerName ?? '');
    _manager = TextEditingController(text: p?.managerName ?? '');
    _phone = TextEditingController(text: p?.phone ?? '');
    _city = TextEditingController(text: p?.city ?? '');
    _address = TextEditingController(text: p?.address ?? '');
  }

  @override
  void dispose() {
    _name.dispose(); _owner.dispose(); _manager.dispose();
    _phone.dispose(); _city.dispose(); _address.dispose();
    super.dispose();
  }

  Widget _input(TextEditingController ctl, String label, {
    bool requiredField = false, TextInputType? type}) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 13),
        child: TextFormField(
          controller: ctl,
          keyboardType: type,
          maxLength: label == 'Nom du maquis' ? 80 : null,
          decoration: InputDecoration(
            labelText: label,
            fillColor: Colors.white,
            filled: true,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
          validator: requiredField
            ? (v) => v == null || v.trim().isEmpty ? 'Champ obligatoire' : null
            : null,
        ),
      );

  Future<void> _submit() async {
    if (_saving || !_form.currentState!.validate()) return;
    final draft = MaquisProfileDraft(
      name: _name.text.trim(),
      ownerName: _owner.text.trim(),
      managerName: _manager.text.trim(),
      phone: _phone.text.trim(),
      city: _city.text.trim(),
      address: _address.text.trim(),
    );
    setState(() => _saving = true);
    try {
      await widget.onSave(draft);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Enregistrement impossible : $e')));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      backgroundColor: const Color(0xFF064430),
      foregroundColor: Colors.white,
      title: Text(widget.initialProfile == null
        ? 'Bienvenue sur MaquisPro' : 'Fiche du maquis'),
    ),
    backgroundColor: _bleu,
    body: Form(
      key: _form,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const ChampagneBackground(),
          const SizedBox(height: 15),
          Text(
            widget.initialProfile == null
              ? 'Personnaliser votre établissement'
              : 'Mettre à jour les coordonnées',
            style: const TextStyle(
              color: _vert,fontSize: 20,fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 6),
          const Text(
            'Même application pour plusieurs maquis. Chaque établissement '
            'aura sa propre fiche et ses propres données dans la future version connectée.',
          ),
          const SizedBox(height: 14),
          _input(_name, 'Nom du maquis',requiredField: true),
          _input(_owner, 'Nom du propriétaire',requiredField: true),
          _input(_manager, 'Nom du gérant (facultatif)'),
          _input(_phone, 'Téléphone',requiredField: true,type: TextInputType.phone),
          _input(_city, 'Ville / commune',requiredField: true),
          _input(_address, 'Adresse (facultatif)'),
          Card(
            color: const Color(0xFFFFF8E6),
            child: const Padding(
              padding: EdgeInsets.all(13),
              child: Text(
                'MODE DÉMONSTRATION : cette fiche reste sur ce téléphone. '
                'Elle ne constitue pas une activation de licence IGC. '
                'Date d’activation commerciale : en attente.',
              ),
            ),
          ),
          const SizedBox(height: 8),
          FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: _vert,
              padding: const EdgeInsets.symmetric(vertical: 17),
            ),
            onPressed: _saving ? null : _submit,
            icon: const Icon(Icons.save_outlined),
            label: Text(_saving ? 'Enregistrement...' : 'Enregistrer la fiche'),
          ),
          const SizedBox(height: 18),
        ],
      ),
    ),
  );
}
