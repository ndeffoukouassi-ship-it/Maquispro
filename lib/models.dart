class Drink {
  const Drink({required this.id, required this.name, required this.purchasePrice,
    required this.salePrice, required this.stock, this.barcode});
  final int id;
  final String name;
  final int purchasePrice;
  final int salePrice;
  final int stock;
  final String? barcode;

  int get grossProfitPerUnit => salePrice - purchasePrice;
  factory Drink.fromMap(Map<String, Object?> data) => Drink(
    id: data['id'] as int,
    name: data['nom'] as String,
    purchasePrice: data['prix_achat'] as int,
    salePrice: data['prix_vente'] as int,
    stock: data['stock'] as int,
    barcode: data['code_barres'] as String?,
  );
}

class Sale {
  const Sale({required this.id, required this.drinkName, required this.server,
    required this.price, required this.cost, required this.timestamp});
  final int id;
  final String drinkName;
  final String server;
  final int price;
  final int cost;
  final DateTime timestamp;
  int get grossProfit => price - cost;

  factory Sale.fromMap(Map<String, Object?> data) => Sale(
    id: data['id'] as int,
    drinkName: data['boisson'] as String,
    server: data['serveur'] as String,
    price: data['prix_vente'] as int,
    cost: data['prix_achat'] as int,
    timestamp: DateTime.fromMillisecondsSinceEpoch(data['date_ms'] as int),
  );
}

class Expense {
  const Expense({required this.label, required this.amount});
  final String label;
  final int amount;
  factory Expense.fromMap(Map<String,Object?> data) => Expense(
    label: data['libelle'] as String, amount: data['montant'] as int);
}

class MaquisSnapshot {
  const MaquisSnapshot({required this.drinks,required this.sales,required this.expenses});
  final List<Drink> drinks;
  final List<Sale> sales;
  final List<Expense> expenses;
  int get revenue => sales.fold(0, (sum, sale) => sum + sale.price);
  int get grossProfit => sales.fold(0, (sum, sale) => sum + sale.grossProfit);
  int get expensesTotal => expenses.fold(0, (sum, expense) => sum + expense.amount);
  int get netProfit => grossProfit - expensesTotal;
  int get totalBottlesSold => sales.length;
  int get lowStockItems => drinks.where((drink) => drink.stock <= 5).length;
}
