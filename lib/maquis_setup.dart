import 'package:flutter/material.dart';
import 'maquis_profile.dart';

const _vert = Color(0xFF08623F);
const _or = Color(0xFFD4AF37);
const _bleu = Color(0xFFE4F3FF);

/// Illustration vectorielle intégrée : bouteille de champagne générique.
/// Aucun visuel tiers ni marque de champagne.
class ChampagneBackground extends StatelessWidget {
  const ChampagneBackground({super.key, this.title = 'MaquisPro',
    this.subtitle = 'Gestion intelligente des boissons'});
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) => Container(
    height: 218,
    decoration: const BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [_bleu, Color(0xFFBEDFEF)],
      ),
      borderRadius: BorderRadius.all(Radius.circular(22)),
    ),
    clipBehavior: Clip.antiAlias,
    child: Stack(children: [
      Positioned(
        top: -10, right: 5, bottom: -25, width: 175,
        child: CustomPaint(painter: _ChampagnePainter()),
      ),
      Positioned(
        top: 38, left: 20, right: 100,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: _vert, fontSize: 28, fontWeight: FontWeight.w900)),
            const SizedBox(height: 8),
            Text(subtitle,
              style: const TextStyle(color: _vert, fontSize: 15)),
            const SizedBox(height: 18),
            const Text('IGC • Impact Global Consulting',
              style: TextStyle(color: Color(0xFF876819),fontSize: 11,
                fontWeight: FontWeight.w800)),
          ],
        ),
      ),
    ]),
  );
}

class _ChampagnePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.translate(size.width * .51, size.height * .08);
    canvas.rotate(.19);
    final h = size.height * .88;
    final w = size.width * .39;
    final outline = Path()
      ..moveTo(-w * .17, 0)
      ..lineTo(w * .17, 0)
      ..lineTo(w * .17, h * .27)
      ..cubicTo(w * .19, h * .35, w * .53, h * .36, w * .55, h * .51)
      ..lineTo(w * .55, h * .94)
      ..quadraticBezierTo(w * .55, h, w * .39, h)
      ..lineTo(-w * .39, h)
      ..quadraticBezierTo(-w * .55, h, -w * .55, h * .94)
      ..lineTo(-w * .55, h * .51)
      ..cubicTo(-w * .53, h * .36, -w * .19, h * .35, -w * .17, h * .27)
      ..close();
    canvas.drawPath(outline, Paint()
      ..shader = const LinearGradient(colors: [
        Color(0xFF085A41), Color(0xFF169A6D), Color(0xFF063D2C),
      ]).createShader(Rect.fromLTWH(-w*.6, 0, w*1.2, h)));
    canvas.drawPath(outline, Paint()
      ..color = _or
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4);
    canvas.drawRect(Rect.fromLTRB(-w*.19, 0, w*.19, h*.15),
      Paint()..color = _or);
    canvas.drawRRect(
      RRect.fromRectAndRadius(Rect.fromLTRB(-w*.5,h*.57,w*.5,h*.78),
        const Radius.circular(6)),
      Paint()..color = const Color(0xFFF9E7B0));
    final text = TextPainter(
      text: const TextSpan(text:'MP',style: TextStyle(
        fontSize: 29,color:_vert,fontWeight:FontWeight.bold)),
      textDirection: TextDirection.ltr,
    )..layout();
    text.paint(canvas, Offset(-text.width/2,h*.625));
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
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
