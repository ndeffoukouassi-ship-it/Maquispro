import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'maquis_profile.dart';

const _vert = Color(0xFF08623F);
const _bleu = Color(0xFFE4F3FF);
const _or = Color(0xFFD4AF37);

/// Bandeau approuvé par IGC : logo MaquisPro plutôt que bouteille.
/// Conçu pour fonctionner sans réseau, comme le reste du prototype local.
class MaquisLogoBanner extends StatelessWidget {
  const MaquisLogoBanner({
    super.key,
    this.title = 'Bienvenue',
    this.subtitle = 'Gestion intelligente des boissons',
  });

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) => Container(
    height: 221,
    clipBehavior: Clip.antiAlias,
    decoration: BoxDecoration(
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF08764F), Color(0xFF064831), Color(0xFF002F24)],
      ),
      border: Border.all(color: _or, width: 2.5),
      borderRadius: const BorderRadius.all(Radius.circular(22)),
      boxShadow: const [
        BoxShadow(color: Color(0x55002620), offset: Offset(0, 7), blurRadius: 11),
      ],
    ),
    padding: const EdgeInsets.symmetric(vertical: 15, horizontal: 10),
    child: Row(
      children: [
        SizedBox(
          width: 122,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              SvgPicture.asset(
                'assets/images/maquispro_emblem.svg',
                width: 112, height: 112,
                semanticsLabel: 'Logo MaquisPro',
                placeholderBuilder: (_) =>
                    const Icon(Icons.sports_bar, size: 72, color: _or),
              ),
              const SizedBox(height: 3),
              const Text(
                'MaquisPro',
                style: TextStyle(
                  fontFamily: 'serif', fontWeight: FontWeight.w900,
                  color: Color(0xFFF9D66A), fontSize: 20,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Container(
          width: 2, height: 150,
          decoration: const BoxDecoration(
            gradient: LinearGradient(colors: [
              Color(0xFF8E6A1C), Color(0xFFFFE7A3), Color(0xFF8E6A1C),
            ], begin: Alignment.topCenter, end: Alignment.bottomCenter),
          ),
        ),
        const SizedBox(width: 13),
        Expanded(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DecoratedBox(
                decoration: BoxDecoration(
                  color: const Color(0xFFF9E7B0),
                  border: Border.all(color: _or, width: 1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  child: Text('ESPACE GÉRANT', style: TextStyle(
                    color: Color(0xFF064831),
                    fontSize: 11, fontWeight: FontWeight.w900,
                  )),
                ),
              ),
              const SizedBox(height: 10),
              Text(title,
                maxLines: 3, overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white, fontSize: 19,
                  fontWeight: FontWeight.w900,
                )),
              const SizedBox(height: 8),
              Text(subtitle,
                maxLines: 3, overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.white, fontSize: 12)),
              const SizedBox(height: 9),
              const Text('IGC • IMPACT GLOBAL CONSULTING',
                maxLines: 2,
                style: TextStyle(color: Color(0xFFF0D78F),
                  fontWeight: FontWeight.w700, fontSize: 9)),
            ],
          ),
        ),
      ],
    ),
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
          const MaquisLogoBanner(),
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
