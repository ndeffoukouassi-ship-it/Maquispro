import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import 'database.dart';
import 'models.dart';

const green = Color(0xFF08623F);
const darkGreen = Color(0xFF064430);
const gold = Color(0xFFD4AF37);
const blue = Color(0xFFE4F3FF);

String fcfa(int n) => n.toString() + ' F CFA';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await MaquisDatabase.instance.open();
  runApp(const MaquisProApp());
}

class MaquisProApp extends StatelessWidget {
  const MaquisProApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'MaquisPro - IGC',
    theme: ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: blue,
      colorScheme: ColorScheme.fromSeed(seedColor: green, primary: green, secondary: gold),
      appBarTheme: const AppBarTheme(backgroundColor: darkGreen, foregroundColor: Colors.white),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    home: const MaquisHome(),
  );
}

class MaquisHome extends StatefulWidget {
  const MaquisHome({super.key});
  @override
  State<MaquisHome> createState() => _MaquisHomeState();
}

class _MaquisHomeState extends State<MaquisHome> {
  MaquisSnapshot? snapshot;
  int tab = 0;
  String server = 'Kouamé';
  final servers = ['Kouamé', 'Awa', 'Ibrahim', 'Marc'];
  String? lastSale;

  @override
  void initState() {
    super.initState();
    reload();
  }

  Future<void> reload() async {
    final value = await MaquisDatabase.instance.snapshot();
    if (mounted) setState(() => snapshot = value);
  }

  void notice(String text, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      backgroundColor: error ? Colors.red.shade800 : darkGreen,
      content: Text(text, style: const TextStyle(color: Colors.white)),
    ));
  }

  Widget heading(String title) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 10),
    child: Text(title, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: darkGreen)),
  );

  Widget tile(String label, String number, IconData icon) => Expanded(
    child: Card(
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, color: green),
          const SizedBox(height: 8),
          Text(number, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.bold)),
          Text(label, style: const TextStyle(fontSize: 12)),
        ]),
      ),
    ),
  );

  Future<void> scanner() async {
    final result = await Navigator.of(context).push<Sale>(
      MaterialPageRoute(builder: (_) => ScannerPage(server: server)),
    );
    if (result == null) return;
    await HapticFeedback.mediumImpact();
    setState(() => lastSale = result.drinkName + ' - ' + fcfa(result.price));
    await reload();
    notice('VENTE ENREGISTRÉE : ' + result.drinkName + ' - ' + fcfa(result.price));
  }

  Future<void> demoSale(Drink drink) async {
    try {
      final result = await MaquisDatabase.instance.sellById(drink.id, server);
      setState(() => lastSale = result.drinkName + ' - ' + fcfa(result.price));
      await reload();
      notice('TEST LOCAL : une vente fictive enregistrée.');
    } catch (e) {
      notice(e.toString(), error: true);
    }
  }

  Widget field(TextEditingController c, String label, {bool numeric = false}) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: TextField(
      controller: c,
      keyboardType: numeric ? TextInputType.number : TextInputType.text,
      decoration: InputDecoration(labelText: label),
    ),
  );

  Future<void> addDrink() async {
    final name = TextEditingController();
    final barcode = TextEditingController();
    final purchase = TextEditingController();
    final sale = TextEditingController();
    final stock = TextEditingController(text: '0');
    await showDialog<void>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Ajouter une boisson'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            field(name, 'Nom de la boisson'),
            field(barcode, 'Code-barres vérifié (facultatif)', numeric: true),
            field(purchase, 'Prix d achat en FCFA', numeric: true),
            field(sale, 'Prix de vente en FCFA', numeric: true),
            field(stock, 'Quantité en stock', numeric: true),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialog), child: const Text('Annuler')),
          FilledButton(
            onPressed: () async {
              try {
                await MaquisDatabase.instance.addDrink(
                  name: name.text,
                  barcode: barcode.text,
                  purchasePrice: int.parse(purchase.text),
                  salePrice: int.parse(sale.text),
                  stock: int.parse(stock.text),
                );
                if (dialog.mounted) Navigator.pop(dialog);
                await reload();
                notice('Boisson ajoutée au catalogue local.');
              } catch (e) {
                notice('Saisie invalide : ' + e.toString(), error: true);
              }
            },
            child: const Text('Enregistrer'),
          ),
        ],
      ),
    );
    name.dispose(); barcode.dispose(); purchase.dispose(); sale.dispose(); stock.dispose();
  }

  Future<void> restock(Drink drink) async {
    final count = TextEditingController(text: '12');
    final purchase = TextEditingController(text: drink.purchasePrice.toString());
    await showDialog<void>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text('Livraison : ' + drink.name),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          field(count, 'Bouteilles reçues', numeric: true),
          field(purchase, 'Nouveau prix d achat', numeric: true),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialog), child: const Text('Annuler')),
          FilledButton(
            onPressed: () async {
              try {
                await MaquisDatabase.instance.restock(
                  id: drink.id, quantity: int.parse(count.text),
                  purchasePrice: int.parse(purchase.text),
                );
                if (dialog.mounted) Navigator.pop(dialog);
                await reload();
                notice('Approvisionnement enregistré.');
              } catch (e) {
                notice(e.toString(), error: true);
              }
            },
            child: const Text('Ajouter au stock'),
          ),
        ],
      ),
    );
    count.dispose(); purchase.dispose();
  }

  Future<void> expense() async {
    final label = TextEditingController();
    final amount = TextEditingController();
    await showDialog<void>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Nouvelle dépense'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          field(label, 'Libellé'),
          field(amount, 'Montant FCFA', numeric: true),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialog), child: const Text('Annuler')),
          FilledButton(onPressed: () async {
            try {
              await MaquisDatabase.instance.addExpense(label.text, int.parse(amount.text));
              if (dialog.mounted) Navigator.pop(dialog);
              await reload();
              notice('Dépense enregistrée.');
            } catch(e) {
              notice(e.toString(), error: true);
            }
          }, child: const Text('Enregistrer')),
        ],
      ),
    );
    label.dispose(); amount.dispose();
  }

  Widget manager(MaquisSnapshot s) => ListView(
    padding: const EdgeInsets.all(14),
    children: [
      Card(
        color: darkGreen,
        child: const Padding(
          padding: EdgeInsets.all(18),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Espace Responsable', style: TextStyle(color: gold, fontSize: 23, fontWeight: FontWeight.bold)),
            SizedBox(height: 5),
            Text('Caisse centrale unique - toutes les ventes réunies', style: TextStyle(color: Colors.white)),
          ]),
        ),
      ),
      Row(children: [
        tile('Recettes', fcfa(s.revenue), Icons.account_balance_wallet_outlined),
        tile('Bouteilles vendues', s.totalBottlesSold.toString(), Icons.sports_bar),
      ]),
      Row(children: [
        tile('Bénéfice brut', fcfa(s.grossProfit), Icons.trending_up),
        tile('Bénéfice après charges', fcfa(s.netProfit), Icons.insights),
      ]),
      Card(child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Dépenses enregistrées : ' + fcfa(s.expensesTotal)),
          const SizedBox(height: 8),
          OutlinedButton.icon(onPressed: expense, icon: const Icon(Icons.add), label: const Text('Ajouter une dépense')),
        ]),
      )),
      heading('Stock central'),
      FilledButton.icon(onPressed: addDrink, icon: const Icon(Icons.add_circle_outline), label: const Text('Nouvelle boisson')),
      ...s.drinks.map((drink) => Card(
        child: ListTile(
          leading: Icon(Icons.local_drink, color: drink.stock <= 5 ? Colors.red : green),
          title: Text(drink.name, style: const TextStyle(fontWeight: FontWeight.w700)),
          subtitle: Text('Stock : ' + drink.stock.toString() +
            ' | Achat ' + fcfa(drink.purchasePrice) +
            ' | Vente ' + fcfa(drink.salePrice) +
            '\nMarge brute : ' + fcfa(drink.grossProfitPerUnit)),
          isThreeLine: true,
          trailing: IconButton(
            tooltip: 'Nouvelle livraison',
            icon: const Icon(Icons.add_box_outlined),
            onPressed: () => restock(drink),
          ),
        ),
      )),
      heading('Historique des ventes'),
      if (s.sales.isEmpty) const Text('Aucune vente enregistrée pour le moment.'),
      ...s.sales.take(30).map((sale) => ListTile(
        leading: const Icon(Icons.check_circle_outline, color: green),
        title: Text(sale.drinkName + ' - ' + fcfa(sale.price)),
        subtitle: Text(sale.server + ' | ' + sale.timestamp.toLocal().toString().substring(0,16) +
          ' | marge ' + fcfa(sale.grossProfit)),
      )),
      const SizedBox(height: 28),
      const Text('Mode démonstration : ces données restent uniquement sur ce téléphone.',
        textAlign: TextAlign.center),
    ],
  );

  Widget employee(MaquisSnapshot s) => ListView(
    padding: const EdgeInsets.all(14),
    children: [
      Card(color: darkGreen, child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Espace Employé', style: TextStyle(color: gold, fontSize: 23, fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          DropdownButton<String>(
            value: server, dropdownColor: darkGreen,
            iconEnabledColor: gold,
            style: const TextStyle(color: Colors.white, fontSize: 17),
            items: servers.map((person) => DropdownMenuItem(value: person, child: Text(person))).toList(),
            onChanged: (value) { if (value != null) setState(() => server = value); },
          ),
          const Text('Le client paie, le serveur dépose en caisse centrale, puis scanne.',
            style: TextStyle(color: Colors.white)),
        ]),
      )),
      const SizedBox(height: 15),
      FilledButton.icon(
        style: FilledButton.styleFrom(padding: const EdgeInsets.all(23)),
        onPressed: scanner,
        icon: const Icon(Icons.qr_code_scanner, size: 32),
        label: const Text('SCANNER UNE BOISSON', style: TextStyle(fontSize: 17)),
      ),
      const SizedBox(height: 8),
      const Text('1 scan reconnu = 1 vente enregistrée et 1 bouteille retirée du stock.',
        textAlign: TextAlign.center),
      if (lastSale != null) Card(
        color: const Color(0xFFD6F0E1),
        child: ListTile(
          leading: const Icon(Icons.check_circle, color: green),
          title: const Text('VENTE ENREGISTRÉE'),
          subtitle: Text(lastSale!),
        ),
      ),
      heading('Tester sans scanner (vente fictive)'),
      const Text('Attention : ce bouton enregistre une vente dans les données de démonstration.'),
      ...s.drinks.map((drink) => Card(
        child: ListTile(
          title: Text(drink.name),
          subtitle: Text(fcfa(drink.salePrice) + ' | stock : ' + drink.stock.toString()),
          trailing: OutlinedButton(
            onPressed: drink.stock > 0 ? () => demoSale(drink) : null,
            child: const Text('Tester'),
          ),
        ),
      )),
      heading('Dernières ventes'),
      ...s.sales.take(8).map((sale) => ListTile(
        leading: const Icon(Icons.receipt_long, color: green),
        title: Text(sale.drinkName + ' - ' + fcfa(sale.price)),
        subtitle: Text('Serveur : ' + sale.server),
      )),
    ],
  );

  @override
  Widget build(BuildContext context) {
    final s = snapshot;
    return Scaffold(
      appBar: AppBar(
        title: const Text('MaquisPro', style: TextStyle(fontWeight: FontWeight.bold, color: gold)),
        actions: [
          IconButton(onPressed: reload, icon: const Icon(Icons.refresh), tooltip: 'Actualiser'),
        ],
      ),
      body: s == null ? const Center(child: CircularProgressIndicator())
        : tab == 0 ? manager(s) : employee(s),
      bottomNavigationBar: NavigationBar(
        selectedIndex: tab,
        onDestinationSelected: (index) => setState(() => tab = index),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), label: 'Responsable'),
          NavigationDestination(icon: Icon(Icons.qr_code_scanner), label: 'Employé'),
        ],
      ),
    );
  }
}

class ScannerPage extends StatefulWidget {
  const ScannerPage({super.key, required this.server});
  final String server;
  @override
  State<ScannerPage> createState() => _ScannerPageState();
}

class _ScannerPageState extends State<ScannerPage> {
  bool processing = false;
  String? scanError;

  Future<void> onDetect(BarcodeCapture capture) async {
    if (processing || capture.barcodes.isEmpty) return;
    final code = capture.barcodes.first.rawValue;
    if (code == null || code.isEmpty) return;
    setState(() { processing = true; scanError = null; });
    try {
      final sale = await MaquisDatabase.instance.sellByBarcode(code, widget.server);
      if (!mounted) return;
      Navigator.of(context).pop(sale);
    } catch (e) {
      if (mounted) setState(() => scanError = e.toString());
      await Future<void>.delayed(const Duration(seconds: 2));
      if (mounted) setState(() => processing = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Scanner une boisson')),
    body: Column(children: [
      const Padding(
        padding: EdgeInsets.all(16),
        child: Text('Paiement déjà reçu et déposé dans la caisse centrale. '
          'Le code-barres reconnu enregistre immédiatement une vente.',
          textAlign: TextAlign.center),
      ),
      Expanded(child: MobileScanner(onDetect: onDetect)),
      if (processing) const LinearProgressIndicator(),
      if (scanError != null) Padding(
        padding: const EdgeInsets.all(14),
        child: Text(scanError!, style: const TextStyle(color: Colors.red), textAlign: TextAlign.center),
      ),
      const Padding(
        padding: EdgeInsets.all(12),
        child: Text('Un code inconnu ou un stock épuisé ne déclenche aucune vente.',
          textAlign: TextAlign.center),
      ),
    ]),
  );
}
